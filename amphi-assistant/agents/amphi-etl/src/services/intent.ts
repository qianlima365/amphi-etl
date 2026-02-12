/**
 * 意图识别服务
 * 从原 etl-agent.ts 提取
 */

import { ILLMService } from '../../../../src/core/cognition';
import { createLogger } from '../../../../src/utils/logger';
import { UserIntent, IntentType, ResponseStrategy, DialoguePhase, DialogueMessage, ETLConfig } from '../types';
import { OutputHandler } from '../utils/output';
import { extractJson } from '../utils/helpers';

const logger = createLogger('IntentService');

export interface IntentServiceOptions {
  llm: ILLMService;
  output: OutputHandler;
}

export class IntentService {
  private llm: ILLMService;
  private output: OutputHandler;

  constructor(options: IntentServiceOptions) {
    this.llm = options.llm;
    this.output = options.output;
  }

  /**
   * 快速规则意图检查 - 减少LLM调用
   */
  quickIntentCheck(userInput: string, phase: DialoguePhase): UserIntent | null {
    const input = userInput.toLowerCase().trim();
    
    // 确认意图
    const acceptPatterns = [
      /^[对是好的ok行可以没问题正确]的?$/,
      /^就这么办$/,
      /^确认$/,
      /^yes$/,
      /^yep$/,
      /^sure$/,
      /^confirmed$/
    ];
    if (acceptPatterns.some(p => p.test(input))) {
      return {
        type: 'ACCEPT',
        confidence: 0.95,
        responseStrategy: 'CONFIRM_EXECUTE',
      };
    }

    // 直接生成
    const forceGeneratePatterns = [
      /^直接生成$/,
      /^先生成/,
      /^先这样生成/,
      /^用默认值生成/,
      /^不管了.*生成/,
      /^先(这样)?生成(吧)?$/,
      /^就(这样)?生成(吧)?$/,
      /^生成(吧)?$/,
      /^default.*generate/i,
      /^generate\s*(now)?$/i,
    ];
    if (forceGeneratePatterns.some(p => p.test(input))) {
      return {
        type: 'ACCEPT',
        confidence: 0.9,
        responseStrategy: 'CONFIRM_EXECUTE',
        forceGenerate: true,
      };
    }
    
    // 否定意图
    const rejectPatterns = [
      /^[不错否]$/,
      /^[不行不好]$/,
      /^[错了错误]$/,
      /^no$/,
      /^nope$/,
      /^[换一下换个]/,
      /^[不对不是]/
    ];
    if (rejectPatterns.some(p => p.test(input))) {
      return {
        type: 'REJECT',
        confidence: 0.9,
        responseStrategy: 'ASK_CLARIFY'
      };
    }
    
    // 添加组件意图
    const addPatterns = [
      /^[加添加]个?/,
      /^[添加]个?/,
      /^[需要要求]添加/,
      /^[增加]个?/
    ];
    if (addPatterns.some(p => p.test(input))) {
      return {
        type: 'ADD_COMPONENT',
        confidence: 0.85,
        extractedInfo: { componentToAdd: { componentType: input, description: userInput } },
        responseStrategy: 'ADD_COMPONENT'
      };
    }
    
    // 移除组件意图
    const removePatterns = [
      /^[去掉删除移除]个?/,
      /^[不要]个?/
    ];
    if (removePatterns.some(p => p.test(input))) {
      return {
        type: 'REMOVE_COMPONENT',
        confidence: 0.85,
        responseStrategy: 'MODIFY_CONFIG'
      };
    }
    
    // 修改意图
    const modifyPatterns = [
      /改成/,
      /修改/,
      /变更/,
      /更改/,
      /换成/,
      /设置为/,
      /port[:\s]*\d+/i,
      /host[:\s]*\w+/i
    ];
    if (modifyPatterns.some(p => p.test(input))) {
      return {
        type: 'MODIFY',
        confidence: 0.8,
        extractedInfo: { modificationRequest: userInput },
        responseStrategy: 'MODIFY_CONFIG'
      };
    }
    
    // 问题意图
    const questionPatterns = [
      /\?$/,
      /^[什么怎么如何哪些哪个]/,
      /^what\s/i,
      /^how\s/i,
      /^why\s/i,
      /^which\s/i
    ];
    if (questionPatterns.some(p => p.test(input))) {
      return {
        type: 'QUESTION',
        confidence: 0.9,
        responseStrategy: 'ANSWER'
      };
    }
    
    return null;
  }

  /**
   * 深度意图理解 - 使用LLM
   */
  async understandIntent(
    userInput: string,
    context: {
      phase: DialoguePhase;
      config: ETLConfig;
      history: DialogueMessage[];
      environmentStates?: Map<string, any>;
    }
  ): Promise<UserIntent> {
    const quickResult = this.quickIntentCheck(userInput, context.phase);
    if (quickResult && quickResult.confidence > 0.85) {
      logger.debug('认知层·快速规则意图', { type: quickResult.type, confidence: quickResult.confidence });
      return quickResult;
    }

    logger.debug('认知层·LLM 深度意图分析');
    
    // 环境状态感知
    const envStates = context.environmentStates 
      ? Array.from(context.environmentStates.entries())
          .filter(([_, state]) => state.status !== 'online')
          .map(([name, state]) => ({ name, status: state.status }))
      : [];
    
    const envContext = envStates.length > 0 
      ? `环境状态警告:\n${envStates.map(s => `- ${s.name}: ${s.status}`).join('\n')}`
      : '环境状态: 正常';
    
    const prompt = this.buildIntentPrompt(userInput, context, envContext);

    this.output.start('正在理解您的意图...');
    let resultText = '';
    
    if ('completeStream' in this.llm) {
      await (this.llm as any).completeStream(prompt, (chunk: string) => {
        this.output.write(chunk);
        resultText += chunk;
      });
    } else {
      resultText = await this.llm.complete(prompt);
    }
    
    this.output.end();

    try {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
      
      logger.debug('认知层·意图解析', { rawLength: resultText.length, parsedType: parsed.type });

      const intentType = parsed.type || parsed.intent || 'AMBIGUOUS';
      let normalizedType: IntentType = intentType;
      if (intentType === 'MODIFY_REQUEST') normalizedType = 'MODIFY';
      
      const result: UserIntent = {
        type: normalizedType,
        confidence: parsed.confidence || 0.5,
        extractedInfo: parsed.extractedInfo,
        responseStrategy: parsed.responseStrategy || 'ASK_CLARIFY',
        forceGenerate: Boolean(parsed.forceGenerate),
      };
      
      return result;
    } catch (e) {
      logger.error('认知层·意图解析失败', { error: (e as Error).message });
      return { type: 'AMBIGUOUS', confidence: 0.3, responseStrategy: 'ASK_CLARIFY' };
    }
  }

  /**
   * 构建意图识别提示词
   */
  private buildIntentPrompt(
    userInput: string,
    context: {
      phase: DialoguePhase;
      config: ETLConfig;
      history: DialogueMessage[];
    },
    envContext: string
  ): string {
    const formatCurrentConfig = () => {
      const lines: string[] = [];
      if (context.config.input) lines.push(`输入: ${context.config.input.name}`);
      context.config.transformations.forEach((t, i) => {
        lines.push(`转换${i + 1}: ${t.name}`);
      });
      if (context.config.output) lines.push(`输出: ${context.config.output.name}`);
      return lines.join('\n') || '暂无配置';
    };

    return `
你是一位专业的ETL需求分析师。请深度理解用户输入的真实意图。

## 对话上下文
当前阶段: ${context.phase}
已有配置: ${formatCurrentConfig()}
历史对话:
${context.history.slice(-6).map(h => (h.role === 'user' ? '用户' : 'AI') + ': ' + h.content).join('\n')}

## 环境状态感知（双路采集）
${envContext}

## 用户最新输入
"""${userInput}"""

## 分析维度

1. **输入类型判断**（关键）:
   - NEW_REQUIREMENT: 用户描述了新的数据处理需求（CSV导入MySQL、同步两个数据库等）
   - ACCEPT: 用户表示接受/同意/确认（"好的"、"可以"、"没问题"、"就这么办"、"对的"）
   - REJECT: 用户表示不接受/不对/错了（"不对"、"错了"、"不是这样"、"换一下"）
   - MODIFY: 用户要求修改某个具体配置（"改成localhost"、"换另一个表"、"端口改为3307"）
   - ADD_COMPONENT: 用户要求添加中间组件（"加个数据清洗"、"需要过滤"、"添加转换步骤"）
   - REMOVE_COMPONENT: 用户要求移除组件（"去掉数据清洗"、"删除转换"）
   - QUESTION: 用户在询问信息（"什么是port？"、"有哪些选项？"）
   - AMBIGUOUS: 意图不明确

2. **关键判断规则**:
   - 如果用户只说"对"、"是的"、"没问题" → 这是ACCEPT，不是新需求
   - 如果用户说"直接生成"、"先生成吧"、"用默认值生成"、"先这样生成" → 这是ACCEPT，且 forceGenerate 为 true
   - 如果用户说"不对"、"错了" → 这是REJECT，需要询问具体问题
   - 如果用户给出了具体的值或修改 → 这是MODIFY
   - 如果用户说"加"、"添加"、"需要"某个功能 → 这是ADD_COMPONENT
   - 只有明确提到数据源和目标时 → 才是NEW_REQUIREMENT

3. **提取信息**:
   - 如果是MODIFY：提取要修改的参数和值，放入 paramChanges
   - 如果是NEW_REQUIREMENT：提取sourceType和targetType
   - 如果是ADD_COMPONENT：提取 componentToAdd.componentType、position、description

## 返回JSON格式（重要：字段名必须是 type，不是 intent）
{
  "type": "ACCEPT|REJECT|MODIFY|ADD_COMPONENT|REMOVE_COMPONENT|NEW_REQUIREMENT|QUESTION|AMBIGUOUS",
  "confidence": 0.95,
  "forceGenerate": false,
  "extractedInfo": {
    "sourceType": "...",
    "targetType": "...",
    "paramChanges": {"组件ID": {"参数名": "新值"}},
    "modificationRequest": "修改描述",
    "componentToAdd": {
      "componentType": "DataCleaning|Filter|Transform|Aggregate",
      "position": "between_input_output",
      "description": "用户想要的组件描述"
    }
  },
  "responseStrategy": "PROPOSE|ASK_CLARIFY|CONFIRM_EXECUTE|MODIFY_CONFIG|ADD_COMPONENT|ANSWER",
  "forceGenerate": "当用户说直接生成/先生成吧/用默认值生成时为 true",
  "reasoning": "分析理由"
}`;
  }
}

export default IntentService;
