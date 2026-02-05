/**
 * Intent Service - 意图识别服务
 * 
 * 基于大模型语义理解识别用户意图：
 * - pipeline_generate: 生成 Pipeline
 * - pipeline_edit: 编辑现有 Pipeline
 * - none: 普通对话（问候、闲聊、询问等）
 * 
 * 优先使用 LLM 进行语义理解，关键词匹配仅作为降级方案
 */

import { LLMService } from './llmService';

// 意图类型
export type IntentType = 'pipeline_generate' | 'pipeline_edit' | 'none';

// 意图识别结果
export interface IntentResult {
  intent: IntentType;
  confidence: number;  // 0-1
  reasons?: string[];
  suggestedTemplate?: string;
}

// 对话消息
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// LLM 意图分类的系统提示词
const INTENT_CLASSIFICATION_PROMPT = `你是一个精准的意图分类器。你的任务是分析用户输入，判断用户的真实意图。

## 意图类型

1. **pipeline_generate** - 用户明确想要创建/生成数据处理流程
   - 用户描述了具体的数据源（如 MySQL、CSV、API）
   - 用户描述了数据目标（如导出到文件、写入数据库）
   - 用户明确说"生成"、"创建"、"构建" Pipeline/流程/ETL
   - 示例：
     - "帮我生成一个从 MySQL 读取数据导出到 CSV 的 pipeline"
     - "我需要一个数据同步流程，从 A 库同步到 B 库"
     - "创建一个 ETL 流程处理用户数据"

2. **pipeline_edit** - 用户想要修改/编辑现有的 Pipeline
   - 用户提到"修改"、"编辑"、"调整"现有流程
   - 用户想要添加/删除/移动节点
   - 示例：
     - "修改一下刚才的 pipeline，添加一个过滤节点"
     - "把输出改成 JSON 格式"

3. **none** - 普通对话，不涉及 Pipeline 操作
   - 问候语（你好、hi、hello）
   - 询问身份（你是谁、你能做什么）
   - 感谢告别（谢谢、再见）
   - 概念询问（什么是 ETL、Pipeline 是什么意思）
   - 帮助请求（怎么使用、有什么功能）
   - 闲聊对话
   - 简短的确认回复（好的、明白了）
   - 示例：
     - "你好"
     - "你是谁"
     - "ETL 是什么"
     - "谢谢"
     - "这个平台能做什么"

## 判断规则

1. **保守原则**：如果不确定，优先判断为 none
2. **明确性原则**：只有当用户明确表达了数据处理需求（有数据源、有目标、有动作）时，才判断为 pipeline_generate
3. **上下文原则**：简短的输入（如"好的"、"继续"）通常是 none
4. **语义理解**：理解用户的真实意图，而不是简单的关键词匹配

## 输出格式

仅输出 JSON，不要有其他内容：
{
  "intent": "pipeline_generate" | "pipeline_edit" | "none",
  "confidence": 0.0-1.0,
  "reason": "简短说明判断理由"
}`;

/**
 * Intent Service 类
 */
export class IntentService {
  // 默认置信度阈值
  private static readonly DEFAULT_THRESHOLD = 0.6;
  
  // LLM 调用超时时间（毫秒）
  private static readonly LLM_TIMEOUT = 10000;

  /**
   * 识别意图 - 主入口
   * 优先使用 LLM 语义理解，降级到规则匹配
   */
  static async recognizeIntent(
    messages: ConversationMessage[],
    options?: {
      threshold?: number;
      userId?: string;
      providerId?: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    }
  ): Promise<IntentResult> {
    const startTime = Date.now();
    const threshold = options?.threshold ?? this.DEFAULT_THRESHOLD;

    console.log('\n========== [IntentService] 意图识别开始 ==========');
    console.log('消息数量:', messages.length);
    console.log('阈值:', threshold);

    // 获取最新的用户消息
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      console.log('[IntentService] 没有用户消息，返回 none');
      return { intent: 'none', confidence: 1.0, reasons: ['没有用户消息'] };
    }

    const userInput = lastUserMessage.content.trim();
    console.log('[IntentService] 用户输入:', userInput.substring(0, 100));

    // Step 1: 快速过滤 - 极短的输入直接判断为普通对话
    if (userInput.length <= 5) {
      console.log('[IntentService] 输入过短，直接判断为普通对话');
      console.log('========== [IntentService] 意图识别结束 ==========\n');
      return {
        intent: 'none',
        confidence: 1.0,
        reasons: ['输入过短，判断为普通对话']
      };
    }

    // Step 2: 尝试使用 LLM 进行语义理解
    const userId = options?.userId || 'intent-service';
    const providerId = options?.providerId;
    
    if (providerId) {
      try {
        console.log('[IntentService] 使用 LLM 进行语义理解...');
        const llmResult = await this.classifyWithLLM(
          userInput,
          messages.slice(-5), // 最近5条消息作为上下文
          userId,
          providerId,
          options?.model,
          options?.apiKey,
          options?.baseUrl
        );

        const duration = Date.now() - startTime;
        console.log(`[IntentService] LLM 语义理解完成 (${duration}ms):`, {
          intent: llmResult.intent,
          confidence: llmResult.confidence.toFixed(2),
          reason: llmResult.reasons?.[0]
        });
        console.log('========== [IntentService] 意图识别结束 ==========\n');
        
        return llmResult;
      } catch (error: any) {
        console.error('[IntentService] LLM 调用失败，降级到规则匹配:', error.message);
      }
    } else {
      console.log('[IntentService] 未配置 LLM，使用规则匹配');
    }

    // Step 3: 降级方案 - 使用简单规则匹配
    const ruleResult = this.matchByRules(userInput);
    const duration = Date.now() - startTime;
    console.log(`[IntentService] 规则匹配完成 (${duration}ms):`, ruleResult);
    console.log('========== [IntentService] 意图识别结束 ==========\n');
    
    return ruleResult;
  }

  /**
   * 使用 LLM 进行语义理解
   */
  private static async classifyWithLLM(
    userInput: string,
    contextMessages: ConversationMessage[],
    userId: string,
    providerId: string,
    model?: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<IntentResult> {
    // 构建上下文
    let context = '';
    if (contextMessages.length > 1) {
      context = '\n\n## 对话上下文\n' + contextMessages
        .slice(0, -1)  // 排除最后一条（即当前输入）
        .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
        .join('\n');
    }

    const userPrompt = `${context}

## 当前用户输入
${userInput}

请分析用户的意图并输出 JSON 结果。`;

    try {
      const response = await LLMService.chat(
        userId,
        [
          { role: 'system', content: INTENT_CLASSIFICATION_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        {
          providerId,
          model,
          apiKey,
          baseUrl,
          temperature: 0.1,  // 低温度，更确定性的输出
          maxTokens: 150     // 只需要短输出
        }
      );

      // 解析 LLM 响应
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const intent = this.validateIntent(parsed.intent);
        const confidence = Math.min(1, Math.max(0, parsed.confidence || 0.8));
        
        return {
          intent,
          confidence,
          reasons: [parsed.reason || 'LLM 语义理解'],
          suggestedTemplate: intent === 'pipeline_generate' ? this.suggestTemplate(userInput) : undefined
        };
      }
      
      throw new Error('LLM 响应格式无效');
    } catch (error: any) {
      console.error('[IntentService] LLM 解析错误:', error.message);
      throw error;
    }
  }

  /**
   * 验证意图类型
   */
  private static validateIntent(intent: string): IntentType {
    if (intent === 'pipeline_generate' || intent === 'pipeline_edit') {
      return intent;
    }
    return 'none';
  }

  /**
   * 规则匹配（降级方案）
   * 仅在 LLM 不可用时使用
   */
  private static matchByRules(text: string): IntentResult {
    const trimmedText = text.trim().toLowerCase();
    
    // 非 Pipeline 意图的模式
    const nonPipelinePatterns = [
      /^(你好|您好|hi|hello|hey|嗨|哈喽|早上好|下午好|晚上好)/,
      /^(你是谁|你是什么|介绍.*自己|你叫什么|你的名字)/,
      /^(谢谢|感谢|thanks|thank you|多谢)/,
      /^(再见|拜拜|bye|goodbye|回见)/,
      /^(好的|ok|行|可以|明白|了解|知道了|收到|嗯|哦)/,
      /^(帮助|help|怎么用|怎么使用|使用方法|使用说明|怎么操作)/,
      /(什么是|是什么|什么意思|解释.*下|介绍.*下).{0,10}(etl|pipeline|流程|组件|节点)/,
      /(能做什么|有什么功能|可以做什么|支持什么)/,
      /^(测试|test)$/
    ];

    for (const pattern of nonPipelinePatterns) {
      if (pattern.test(trimmedText)) {
        return {
          intent: 'none',
          confidence: 0.95,
          reasons: ['匹配到普通对话模式']
        };
      }
    }

    // Pipeline 生成意图的模式
    const generatePatterns = [
      /(?:生成|创建|构建|新建|设计|搭建).{0,15}(?:pipeline|流程|etl|数据流)/,
      /(?:帮我|请|需要|想要).{0,20}(?:生成|创建|构建).{0,15}(?:pipeline|流程)/,
      /(?:从|把|将).{0,30}(?:导入|导出|同步|迁移|传输).{0,15}(?:到|至)/,
      /(?:读取|抽取|获取).{0,15}(?:数据|表|文件).{0,15}(?:写入|存储|输出|保存)/,
      /(?:mysql|postgres|csv|json|excel|api).{0,30}(?:导入|导出|同步|读取|写入)/
    ];

    for (const pattern of generatePatterns) {
      if (pattern.test(trimmedText)) {
        return {
          intent: 'pipeline_generate',
          confidence: 0.8,
          reasons: ['匹配到 Pipeline 生成模式'],
          suggestedTemplate: this.suggestTemplate(text)
        };
      }
    }

    // Pipeline 编辑意图的模式
    const editPatterns = [
      /(?:修改|编辑|更新|调整|改).{0,15}(?:pipeline|流程|节点)/,
      /(?:添加|删除|移除|增加|去掉).{0,15}(?:节点|步骤|组件)/,
      /(?:优化|改进|调整).{0,15}(?:pipeline|流程)/
    ];

    for (const pattern of editPatterns) {
      if (pattern.test(trimmedText)) {
        return {
          intent: 'pipeline_edit',
          confidence: 0.75,
          reasons: ['匹配到 Pipeline 编辑模式']
        };
      }
    }

    // 默认返回普通对话
    return {
      intent: 'none',
      confidence: 0.7,
      reasons: ['未匹配到明确的 Pipeline 意图，默认为普通对话']
    };
  }

  /**
   * 根据文本内容建议模板
   */
  private static suggestTemplate(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('mysql') || lowerText.includes('postgres') || lowerText.includes('数据库')) {
      if (lowerText.includes('csv') || lowerText.includes('文件') || lowerText.includes('excel')) {
        return 'db_to_file';
      }
      return 'db_sync';
    }

    if (lowerText.includes('csv') || lowerText.includes('excel') || lowerText.includes('文件')) {
      if (lowerText.includes('数据库') || lowerText.includes('mysql') || lowerText.includes('postgres')) {
        return 'file_to_db';
      }
      return 'file_transform';
    }

    if (lowerText.includes('api') || lowerText.includes('接口') || lowerText.includes('http')) {
      return 'api_integration';
    }

    return 'general';
  }

  /**
   * 检查是否达到触发阈值
   */
  static shouldTrigger(result: IntentResult, threshold?: number): boolean {
    const th = threshold ?? this.DEFAULT_THRESHOLD;
    return result.intent !== 'none' && result.confidence >= th;
  }
}

export default IntentService;
