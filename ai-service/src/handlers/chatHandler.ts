/**
 * Chat Handler - 统一对话处理器
 * 
 * 系统提示词优先级（从高到低）：
 * 1. 核心系统提示词 - 内置不可修改，定义 AI 角色和基本行为
 * 2. Pipeline Agent 提示词 - 用于 Pipeline 生成时的专业指导
 * 3. 用户自定义提示词 - 可选补充，优先级最低
 * 
 * 自动识别用户意图：
 * - 普通对话：直接调用 LLM 回复
 * - Pipeline 生成：调用 Agent 生成 Pipeline
 */

import { Request, Response } from 'express';
import { IntentService, ConversationMessage } from '../services/intentService';
import { TemplateService } from '../services/templateService';
import { GraphBuilder } from '../services/graphBuilder';
import { Validator } from '../services/validator';
import { LLMService } from '../services/llmService';

// ============================================================================
// 系统提示词定义
// ============================================================================

/**
 * 核心系统提示词 - 定义 AI 助手的基本角色和行为规范
 * 优先级: 最高（内置不可修改）
 */
const CORE_SYSTEM_PROMPT = `你是 TongBase Foundry ETL平台的 AI 助手，专门帮助用户构建数据处理 Pipeline。

## 你的职责
1. **理解用户意图**：判断用户是想聊天、询问问题，还是想创建/修改数据 Pipeline
2. **友好对话**：对于日常问候和一般问题，以友好、专业的方式回应
3. **Pipeline 构建**：当用户明确表达数据处理需求时，帮助生成 Pipeline

## 对话规则
- 使用中文回复，语气友好专业
- 对于 "你好"、"在吗" 等问候语，直接友好回应，不要生成 Pipeline
- 只有当用户明确描述了数据源、数据处理需求时，才考虑生成 Pipeline
- 如果需求不明确，先询问确认，不要自行假设

## 你可以帮助的范围
- 解释 ETL 概念和 Pipeline 组件用法
- 根据需求生成数据处理 Pipeline
- 调试和优化现有 Pipeline
- 回答关于数据处理的技术问题`;

/**
 * 普通对话系统提示词 - 用于非 Pipeline 生成的对话
 * 优先级: 中等
 */
const CHAT_SYSTEM_PROMPT = `${CORE_SYSTEM_PROMPT}

## 可用组件参考
### 输入组件
- **CSV/JSON/Excel/Parquet 文件**：从本地文件读取数据
- **MySQL/PostgreSQL/Snowflake 数据库**：从数据库读取数据
- **REST API**：从 HTTP 接口获取数据

### 转换组件
- **Filter (过滤)**：按条件筛选数据行
- **Aggregate (聚合)**：分组汇总计算
- **Join (连接)**：合并多个数据源
- **Sort (排序)**：对数据排序
- **Rename (重命名)**：修改列名
- **TypeConverter (类型转换)**：转换数据类型
- **Select (选择列)**：选取特定列
- **Deduplicate (去重)**：删除重复数据

### 输出组件
- **CSV/JSON/Excel/Parquet 文件**：输出到文件
- **MySQL/PostgreSQL 数据库**：写入数据库

## 回复要求
- 简洁明了，避免冗长
- 如果用户想生成 Pipeline，引导他们描述：数据从哪里来、要做什么处理、数据要到哪里去`;

/**
 * Pipeline 生成专用系统提示词 - 用于 Pipeline 生成任务
 * 优先级: 高（Pipeline 生成时使用）
 */
const PIPELINE_AGENT_SYSTEM_PROMPT = `${CORE_SYSTEM_PROMPT}

## Pipeline 生成任务

你现在需要根据用户需求生成一个 ETL Pipeline。请严格按照以下规范输出 JSON。

### 输出格式要求
输出必须是符合 .ampln 格式的纯 JSON，结构如下：
\`\`\`json
{
  "name": "Pipeline 名称",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "唯一节点ID",
      "type": "组件类型",
      "position": { "x": 数字, "y": 数字 },
      "data": { "组件参数": "值" }
    }
  ],
  "edges": [
    {
      "id": "唯一边ID",
      "source": "源节点ID",
      "target": "目标节点ID"
    }
  ],
  "variables": {}
}
\`\`\`

### 可用组件类型 (type 字段)
**输入组件:**
- \`csvFileInput\` - CSV文件输入 (data: { filePath: string })
- \`jsonFileInput\` - JSON文件输入 (data: { filePath: string })
- \`excelFileInput\` - Excel文件输入 (data: { filePath: string, sheetName?: string })
- \`parquetFileInput\` - Parquet文件输入 (data: { filePath: string })
- \`mySQLInput\` - MySQL数据库输入 (data: { host, port, databaseName, username, tableName })
- \`postgresInput\` - PostgreSQL输入 (data: { host, port, databaseName, username, tableName })
- \`snowflakeInput\` - Snowflake输入 (data: { account, warehouse, database, schema, tableName })
- \`restApiInput\` - REST API输入 (data: { url, method, headers })

**转换组件:**
- \`filter\` - 过滤 (data: { condition: "pandas表达式" })
- \`aggregate\` - 聚合 (data: { groupBy: [], aggregations: [] })
- \`join\` - 连接 (data: { joinType: "inner|left|right|outer", leftKey, rightKey })
- \`sort\` - 排序 (data: { sortBy: string, ascending: boolean })
- \`rename\` - 重命名 (data: { columns: { 旧名: 新名 } })
- \`typeConverter\` - 类型转换 (data: { conversions: { 列名: 目标类型 } })
- \`select\` - 选择列 (data: { columns: [] })
- \`deduplicate\` - 去重 (data: { subset?: [] })

**输出组件:**
- \`csvFileOutput\` - CSV文件输出 (data: { filePath: string })
- \`jsonFileOutput\` - JSON文件输出 (data: { filePath: string })
- \`excelFileOutput\` - Excel文件输出 (data: { filePath: string })
- \`parquetFileOutput\` - Parquet文件输出 (data: { filePath: string })
- \`mySQLOutput\` - MySQL输出 (data: { host, port, databaseName, username, tableName, writeMode })
- \`postgresOutput\` - PostgreSQL输出 (data: { host, port, databaseName, username, tableName, writeMode })

### 生成规则
1. **必须有输入和输出**：至少一个输入节点和一个输出节点
2. **节点 ID 唯一**：使用 "node-1", "node-2" 等格式
3. **边 ID 唯一**：使用 "edge-1", "edge-2" 等格式
4. **位置布局**：节点垂直排列，y 坐标递增 150
5. **DAG 结构**：不能有环路，数据从输入流向输出
6. **仅输出 JSON**：不要添加任何解释文字

### 示例
用户需求: "从 CSV 读取数据，过滤 age > 18 的记录，输出到另一个 CSV"

输出:
\`\`\`json
{
  "name": "Filter Adults Pipeline",
  "version": "1.0.0",
  "nodes": [
    { "id": "node-1", "type": "csvFileInput", "position": { "x": 100, "y": 100 }, "data": { "filePath": "./input.csv" } },
    { "id": "node-2", "type": "filter", "position": { "x": 100, "y": 250 }, "data": { "condition": "age > 18" } },
    { "id": "node-3", "type": "csvFileOutput", "position": { "x": 100, "y": 400 }, "data": { "filePath": "./output.csv" } }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2" },
    { "id": "edge-2", "source": "node-2", "target": "node-3" }
  ],
  "variables": {}
}
\`\`\``;

/**
 * 合并系统提示词
 * 将内置提示词与用户自定义提示词合并
 */
function buildSystemPrompt(
  basePrompt: string, 
  customPrompt?: string
): string {
  if (!customPrompt || customPrompt.trim() === '') {
    return basePrompt;
  }
  
  // 用户自定义提示词作为补充，追加在末尾
  return `${basePrompt}

## 用户自定义补充说明
${customPrompt.trim()}`;
}

// 聊天消息类型
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 聊天请求
interface ChatRequest {
  messages: ChatMessage[];
  userId?: string;
  model?: {
    providerId: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
  customPrompt?: string;  // 用户自定义提示词
  intentThreshold?: number;
}

// 聊天响应
interface ChatResponse {
  success: boolean;
  message?: string;
  intent?: {
    type: 'pipeline_generate' | 'pipeline_edit' | 'chat' | 'none';
    confidence: number;
  };
  pipeline?: any;
  validation?: any;
  metadata?: {
    generationMethod?: string;
    duration?: number;
    model?: string;
    provider?: string;
  };
  error?: {
    message: string;
    suggestions?: string[];
  };
}

/**
 * POST /agent/chat
 * 统一对话接口 - 自动判断意图
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  console.log('\n========== [Chat Handler] 对话开始 ==========');
  console.log('请求时间:', new Date().toISOString());
  
  try {
    const {
      messages,
      userId = 'default',
      model: modelConfig,
      customPrompt,
      intentThreshold = 0.6,
      stream: wantStream = false
    } = req.body as ChatRequest & { stream?: boolean };

    // 验证必填参数
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'messages 是必填项' }
      });
      return;
    }

    // 获取最新的用户消息
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
    
    if (!lastUserMessage) {
      res.status(400).json({
        success: false,
        error: { message: '缺少用户消息' }
      });
      return;
    }

    console.log('[Chat Handler] 用户消息:', lastUserMessage.content);
    console.log('[Chat Handler] 历史消息数:', userMessages.length);
    console.log('[Chat Handler] 意图阈值:', intentThreshold);
    console.log('[Chat Handler] 模型配置:', modelConfig?.providerId ? `${modelConfig.providerId}/${modelConfig.model}` : '(未配置)');

    // Step 1: 意图识别（基于 LLM 语义理解）
    console.log('\n[Chat Handler] ==================== Step 1: 意图识别 ====================');
    const intentResult = await IntentService.recognizeIntent(
      userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { 
        threshold: intentThreshold,
        userId,
        // 传递模型配置，启用 LLM 语义理解
        providerId: modelConfig?.providerId,
        model: modelConfig?.model,
        apiKey: modelConfig?.apiKey,
        baseUrl: modelConfig?.baseUrl
      }
    );

    const shouldTrigger = IntentService.shouldTrigger(intentResult, intentThreshold);
    console.log('[Chat Handler] 意图识别结果:', {
      intent: intentResult.intent,
      confidence: intentResult.confidence.toFixed(2),
      shouldTrigger,
      reasons: intentResult.reasons
    });
    console.log('[Chat Handler] ==================== 意图识别结束 ====================\n');

    // Step 2: 根据意图决定处理方式
    const shouldGeneratePipeline = 
      intentResult.intent === 'pipeline_generate' && shouldTrigger;
    
    console.log('[Chat Handler] 决策: shouldGeneratePipeline =', shouldGeneratePipeline);

    if (shouldGeneratePipeline) {
      // 生成 Pipeline
      console.log('[Chat Handler] Step 2: 生成 Pipeline...');
      const pipelineResult = await generatePipelineFromChat(
        lastUserMessage.content,
        userId,
        modelConfig,
        customPrompt
      );

      const duration = Date.now() - startTime;
      console.log(`[Chat Handler] Pipeline 生成完成 (${duration}ms)`);
      console.log('========== [Chat Handler] 对话结束 ==========\n');

      res.json({
        success: pipelineResult.success,
        message: pipelineResult.message,
        intent: {
          type: 'pipeline_generate',
          confidence: intentResult.confidence
        },
        pipeline: pipelineResult.pipeline,
        validation: pipelineResult.validation,
        metadata: {
          generationMethod: pipelineResult.generationMethod,
          duration,
          model: modelConfig?.model,
          provider: modelConfig?.providerId
        },
        error: pipelineResult.error
      });
    } else {
      // 普通对话 - 不生成 Pipeline（支持流式输出）
      console.log('\n[Chat Handler] ==================== Step 2: 普通对话 ====================');
      console.log('[Chat Handler] 意图为普通对话，不生成 Pipeline, stream=', wantStream);
      if (wantStream) {
        await handleNormalChatStream(
          req,
          res,
          messages,
          userId,
          modelConfig,
          customPrompt,
          intentResult
        );
      } else {
        const chatResult = await handleNormalChat(
          messages,
          userId,
          modelConfig,
          customPrompt
        );
        const duration = Date.now() - startTime;
        console.log(`[Chat Handler] 对话回复完成 (${duration}ms)`);
        console.log('[Chat Handler] 回复内容:', chatResult.message?.substring(0, 200) + (chatResult.message && chatResult.message.length > 200 ? '...' : ''));
        console.log('==================== 普通对话结束 ====================\n');
        console.log('========== [Chat Handler] 对话结束 ==========\n');
        res.json({
          success: chatResult.success,
          message: chatResult.message,
          intent: {
            type: intentResult.intent === 'none' ? 'chat' : intentResult.intent,
            confidence: intentResult.confidence
          },
          metadata: {
            duration,
            model: modelConfig?.model,
            provider: modelConfig?.providerId
          },
          error: chatResult.error
        });
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Chat Handler] 错误:', error);
    console.log(`[Chat Handler] 耗时: ${duration}ms`);
    console.log('========== [Chat Handler] 对话结束 (异常) ==========\n');

    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * 构建普通对话的 LLM 消息列表（供 handleNormalChat 与 handleNormalChatStream 复用）
 */
function buildChatLLMMessages(
  messages: ChatMessage[],
  customSystemPrompt?: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const systemPrompt = buildSystemPrompt(CHAT_SYSTEM_PROMPT, customSystemPrompt);
  const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];
  const recentMessages = messages.slice(-10);
  for (const msg of recentMessages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }
  return llmMessages;
}

/**
 * 普通对话 - 流式输出（SSE）
 */
async function handleNormalChatStream(
  _req: Request,
  res: Response,
  messages: ChatMessage[],
  userId: string,
  modelConfig?: ChatRequest['model'],
  customSystemPrompt?: string,
  intentResult?: { intent: string; confidence: number }
): Promise<void> {
  const llmMessages = buildChatLLMMessages(messages, customSystemPrompt);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();
  };

  try {
    const stream = LLMService.streamChat(
      userId,
      llmMessages,
      {
        providerId: modelConfig?.providerId || 'openai',
        model: modelConfig?.model,
        apiKey: modelConfig?.apiKey,
        baseUrl: modelConfig?.baseUrl,
        temperature: modelConfig?.temperature ?? 0.7,
        topP: modelConfig?.topP ?? 0.9,
        maxTokens: modelConfig?.maxTokens ?? 2048
      }
    );
    for await (const chunk of stream) {
      if (chunk) sendEvent({ content: chunk });
    }
    sendEvent({
      done: true,
      intent: intentResult ? { type: intentResult.intent === 'none' ? 'chat' : intentResult.intent, confidence: intentResult.confidence } : undefined
    });
  } catch (error: any) {
    console.error('[Chat Handler] 流式对话失败:', error);
    sendEvent({ error: error.message || '流式对话失败' });
    sendEvent({ done: true });
  } finally {
    res.end();
  }
}

/**
 * 处理普通对话
 */
async function handleNormalChat(
  messages: ChatMessage[],
  userId: string,
  modelConfig?: ChatRequest['model'],
  customSystemPrompt?: string
): Promise<{ success: boolean; message?: string; error?: { message: string } }> {
  console.log('[Chat Handler] 系统提示词构建完成');
  const llmMessages = buildChatLLMMessages(messages, customSystemPrompt);

  try {
    const response = await LLMService.chat(
      userId,
      llmMessages,
      {
        providerId: modelConfig?.providerId || 'openai',
        model: modelConfig?.model,
        apiKey: modelConfig?.apiKey,
        baseUrl: modelConfig?.baseUrl,
        temperature: modelConfig?.temperature ?? 0.7,
        topP: modelConfig?.topP ?? 0.9,
        maxTokens: modelConfig?.maxTokens ?? 2048
      }
    );
    return {
      success: true,
      message: response.content
    };
  } catch (error: any) {
    console.error('[Chat Handler] LLM 调用失败:', error);
    return {
      success: false,
      error: { message: `对话失败: ${error.message}` }
    };
  }
}

/**
 * 从对话生成 Pipeline
 */
async function generatePipelineFromChat(
  userMessage: string,
  userId: string,
  modelConfig?: ChatRequest['model'],
  customSystemPrompt?: string
): Promise<{
  success: boolean;
  message?: string;
  pipeline?: any;
  validation?: any;
  generationMethod?: string;
  error?: { message: string; suggestions?: string[] };
}> {
  
  let pipeline: any = null;
  let generationMethod = 'rule';
  let validationResult: any = null;

  // 尝试使用 LLM 生成
  if (modelConfig?.providerId) {
    try {
      // 使用内置 Pipeline Agent 系统提示词 + 用户自定义补充
      const systemPrompt = buildSystemPrompt(PIPELINE_AGENT_SYSTEM_PROMPT, customSystemPrompt);
      
      console.log('[Chat Handler] Pipeline Agent 系统提示词构建完成');
      console.log('[Chat Handler] - Pipeline Agent 提示词长度:', PIPELINE_AGENT_SYSTEM_PROMPT.length);
      console.log('[Chat Handler] - 用户自定义补充:', customSystemPrompt ? `${customSystemPrompt.length} 字符` : '(无)');
      console.log('[Chat Handler] - 最终提示词长度:', systemPrompt.length);
      console.log('[Chat Handler] 调用 LLM 生成 Pipeline...');
      
      const llmResponse = await LLMService.chat(
        userId,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        {
          providerId: modelConfig.providerId,
          model: modelConfig.model,
          apiKey: modelConfig.apiKey,
          baseUrl: modelConfig.baseUrl,
          temperature: modelConfig.temperature ?? 0.2, // 降低温度以获得更稳定的 JSON 输出
          maxTokens: modelConfig.maxTokens ?? 4096
        }
      );

      // 提取 JSON
      const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          pipeline = JSON.parse(jsonMatch[0]);
          generationMethod = 'llm';
          console.log('[Chat Handler] LLM 生成成功');
        } catch (parseError) {
          console.log('[Chat Handler] LLM 响应 JSON 解析失败');
        }
      }
    } catch (llmError: any) {
      console.log('[Chat Handler] LLM 生成失败:', llmError.message);
    }
  }

  // 回退到规则生成
  if (!pipeline) {
    console.log('[Chat Handler] 使用规则生成...');
    const buildResult = GraphBuilder.buildFromRequirement({
      requirement: userMessage
    });

    if (buildResult.success && buildResult.pipeline) {
      pipeline = buildResult.pipeline;
      generationMethod = 'rule';
    } else {
      return {
        success: false,
        message: '无法生成 Pipeline',
        error: {
          message: buildResult.errors?.join('; ') || '生成失败',
          suggestions: buildResult.suggestions || [
            '请明确指定数据源类型（如 MySQL、CSV）',
            '请明确指定目标类型（如 导出到 CSV、写入 PostgreSQL）',
            '示例：从 MySQL 读取用户表数据，导出为 CSV 文件'
          ]
        }
      };
    }
  }

  // 验证 Pipeline
  validationResult = Validator.validate(pipeline);

  // 自动修复
  if (validationResult.fixable && validationResult.summary.errors > 0) {
    const fixedPipeline = Validator.applyAutoFixes(pipeline, validationResult.issues);
    const revalidation = Validator.validate(fixedPipeline);
    
    if (revalidation.summary.errors < validationResult.summary.errors) {
      pipeline = fixedPipeline;
      validationResult = revalidation;
      console.log('[Chat Handler] 已应用自动修复');
    }
  }

  // 构建回复消息
  let message = '';
  if (validationResult.valid) {
    message = `Pipeline 生成成功！\n\n`;
    message += `**节点数**: ${pipeline.nodes?.length || 0}\n`;
    message += `**连接数**: ${pipeline.edges?.length || 0}\n`;
    message += `**生成方式**: ${generationMethod === 'llm' ? 'AI 模型' : '规则引擎'}\n\n`;
    message += `您可以点击"预览"查看详情，或直接"保存"到文件。`;
  } else {
    message = `Pipeline 已生成，但存在 ${validationResult.summary.errors} 个验证问题。\n\n`;
    message += `请检查并修正后再保存。`;
  }

  return {
    success: validationResult.valid,
    message,
    pipeline,
    validation: validationResult,
    generationMethod
  };
}

export default chatHandler;
