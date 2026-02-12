/**
 * 多 Agent 协作示例
 * 演示如何构建 Agent 集群完成复杂任务
 * 
 * 使用 OpenAI 协议对接硅基流动(SiliconFlow)API
 * 请确保设置环境变量: SILICONFLOW_API_KEY
 */

import {
  Agent,
  AgentRole,
  AgentDefinition,
  MessageType,
  Tool,
  ExecutionContext,
  OpenAILLMService,
} from '../src';

// 加载环境变量
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('='.repeat(60));
  console.log('多 Agent 协作示例 - 使用硅基流动 API');
  console.log('='.repeat(60));

  // 检查环境变量
  if (!process.env.SILICONFLOW_API_KEY) {
    console.error('错误: 请设置 SILICONFLOW_API_KEY 环境变量');
    console.log('\n你可以通过以下方式设置:');
    console.log('  1. export SILICONFLOW_API_KEY=your_api_key (Linux/Mac)');
    console.log('  2. set SILICONFLOW_API_KEY=your_api_key (Windows)');
    console.log('  3. 或者在 .env 文件中设置');
    process.exit(1);
  }

  // 创建共享的 LLM 服务
  const llm = new OpenAILLMService({
    apiKey: process.env.SILICONFLOW_API_KEY,
    model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V2.5',
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    temperature: parseFloat(process.env.SILICONFLOW_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.SILICONFLOW_MAX_TOKENS || '4096', 10),
  });

  console.log('\n🤖 LLM 服务已初始化');
  console.log(`   模型: ${llm.getModel()}`);

  // 1. 创建协调者 Agent
  const coordinator = new Agent(
    {
      name: 'Coordinator',
      role: AgentRole.COORDINATOR,
      capabilities: ['task_decomposition', 'resource_allocation', 'conflict_resolution'],
      description: '任务协调者',
    },
    {
      agent: { id: 'coordinator', name: 'Coordinator', role: AgentRole.COORDINATOR, capabilities: [] },
      llm: { 
        provider: 'openai', 
        model: llm.getModel(),
        baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
        apiKey: process.env.SILICONFLOW_API_KEY,
      },
      memory: { shortTerm: { type: 'memory', config: {} }, longTerm: { type: 'postgres', config: {} }, vector: { type: 'chroma', config: {} } },
      execution: { maxConcurrentTasks: 5, defaultTimeout: 30000, retryPolicy: { maxRetries: 2, backoffMultiplier: 2 } },
    },
    llm
  );

  // 2. 创建数据 Agent
  const dataAgent = new Agent(
    {
      name: 'DataAgent',
      role: AgentRole.SPECIALIST,
      capabilities: ['data_extraction', 'data_transformation'],
      description: '数据处理专家',
    },
    {
      agent: { id: 'data-agent', name: 'DataAgent', role: AgentRole.SPECIALIST, capabilities: [] },
      llm: { 
        provider: 'openai', 
        model: llm.getModel(),
        baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
        apiKey: process.env.SILICONFLOW_API_KEY,
      },
      memory: { shortTerm: { type: 'memory', config: {} }, longTerm: { type: 'postgres', config: {} }, vector: { type: 'chroma', config: {} } },
      execution: { maxConcurrentTasks: 3, defaultTimeout: 30000, retryPolicy: { maxRetries: 3, backoffMultiplier: 2 } },
    },
    llm
  );

  dataAgent.registerTool({
    name: 'extract_sales_data',
    description: '抽取销售数据',
    parameters: { type: 'object', properties: { date: { type: 'string' } } },
    handler: async (params, context: ExecutionContext) => {
      console.log(`[DataAgent] 抽取 ${params.date} 的销售数据`);
      return { success: true, data: { sales: 100000, orders: 500 }, duration: 1000 };
    },
  });

  // 3. 创建分析 Agent
  const analysisAgent = new Agent(
    {
      name: 'AnalysisAgent',
      role: AgentRole.SPECIALIST,
      capabilities: ['data_analysis', 'report_generation'],
      description: '数据分析专家',
    },
    {
      agent: { id: 'analysis-agent', name: 'AnalysisAgent', role: AgentRole.SPECIALIST, capabilities: [] },
      llm: { 
        provider: 'openai', 
        model: llm.getModel(),
        baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
        apiKey: process.env.SILICONFLOW_API_KEY,
      },
      memory: { shortTerm: { type: 'memory', config: {} }, longTerm: { type: 'postgres', config: {} }, vector: { type: 'chroma', config: {} } },
      execution: { maxConcurrentTasks: 2, defaultTimeout: 30000, retryPolicy: { maxRetries: 2, backoffMultiplier: 2 } },
    },
    llm
  );

  analysisAgent.registerTool({
    name: 'generate_report',
    description: '生成分析报告',
    parameters: { type: 'object', properties: { data: { type: 'object' } } },
    handler: async (params, context: ExecutionContext) => {
      console.log(`[AnalysisAgent] 生成报告`);
      return { success: true, data: { report: 'sales_report.pdf' }, duration: 2000 };
    },
  });

  // 4. 初始化所有 Agent
  await coordinator.initialize();
  await dataAgent.initialize();
  await analysisAgent.initialize();

  console.log('\n✅ 所有 Agent 已就绪');
  console.log(`   协调者: ${coordinator.id.slice(0, 8)}...`);
  console.log(`   数据 Agent: ${dataAgent.id.slice(0, 8)}...`);
  console.log(`   分析 Agent: ${analysisAgent.id.slice(0, 8)}...`);

  // 5. 创建协作任务
  console.log('\n' + '='.repeat(60));
  console.log('创建协作任务: 生成月度销售报告');
  console.log('='.repeat(60));

  const taskId = await coordinator.collaborate('生成月度销售报告', [
    dataAgent.id,
    analysisAgent.id,
  ]);

  console.log(`\n✅ 协作任务已创建: ${taskId.slice(0, 8)}...`);

  // 6. 模拟任务分配和执行
  const collabManager = coordinator.getCollaborationLayer().getManager();

  // 分配数据抽取任务给 DataAgent
  await collabManager.assignSubtask(
    taskId,
    'extract-task-001',
    dataAgent.id,
    '抽取本月销售数据'
  );

  // 监听任务分配
  dataAgent.on('task:assigned', async (data) => {
    console.log(`\n[DataAgent] 收到任务: ${data.description}`);
    
    // 执行任务
    const result = await dataAgent.getExecutionLayer().executeTask(
      {
        id: data.subtaskId,
        name: '抽取销售数据',
        description: data.description,
        dependencies: [],
        status: 'pending' as any,
        priority: 2,
        tools: ['extract_sales_data'],
        input: { date: '2024-01' },
        retryCount: 0,
        maxRetries: 3,
      },
      {
        taskId: data.subtaskId,
        agentId: dataAgent.id,
        sessionId: taskId,
        planId: taskId,
        memory: { shortTerm: new Map(), get: async () => null, set: async () => {} },
        logger: console as any,
      }
    );

    // 提交结果
    await collabManager.submitResult(taskId, data.subtaskId, result);
  });

  // 监听任务结果
  coordinator.on('task:result', async (msg) => {
    console.log(`\n[Coordinator] 收到任务结果 from ${msg.from.slice(0, 8)}...`);
    
    // 分配分析任务给 AnalysisAgent
    await collabManager.assignSubtask(
      taskId,
      'analysis-task-001',
      analysisAgent.id,
      '分析销售数据并生成报告'
    );
  });

  analysisAgent.on('task:assigned', async (data) => {
    console.log(`\n[AnalysisAgent] 收到任务: ${data.description}`);
    
    // 执行分析任务
    const result = await analysisAgent.getExecutionLayer().executeTask(
      {
        id: data.subtaskId,
        name: '生成报告',
        description: data.description,
        dependencies: [],
        status: 'pending' as any,
        priority: 2,
        tools: ['generate_report'],
        input: { data: { sales: 100000, orders: 500 } },
        retryCount: 0,
        maxRetries: 2,
      },
      {
        taskId: data.subtaskId,
        agentId: analysisAgent.id,
        sessionId: taskId,
        planId: taskId,
        memory: { shortTerm: new Map(), get: async () => null, set: async () => {} },
        logger: console as any,
      }
    );

    // 提交结果
    await collabManager.submitResult(taskId, data.subtaskId, result);
  });

  // 等待任务完成
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('\n' + '='.repeat(60));
  console.log('协作任务统计');
  console.log('='.repeat(60));

  const task = collabManager.getCollaborativeTask(taskId);
  console.log(`\n任务: ${task?.goal}`);
  console.log(`状态: ${task?.status}`);
  console.log(`参与者: ${task?.participants.length}`);
  console.log(`子任务: ${task?.subtasks.size}`);

  // 关闭所有 Agent
  await coordinator.shutdown();
  await dataAgent.shutdown();
  await analysisAgent.shutdown();

  console.log('\n✅ 所有 Agent 已关闭');
}

main().catch(console.error);
