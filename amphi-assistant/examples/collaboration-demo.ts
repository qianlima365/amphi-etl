/**
 * 协作层功能演示
 * 
 * 展示多 Agent 协作的核心能力：
 * 1. 角色分工与任务分配
 * 2. 资源冲突与协商解决
 * 3. 协作任务执行
 */

import {
  CollaborationLayer,
  AgentRoles,
  AgentRole,
  AssignmentStrategy,
  ResourceType,
  InMemoryBroker,
  MessageType,
} from '../src/core/collaboration';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         协作层 (Collaboration Layer) 功能演示               ║');
  console.log('║     多 Agent 协作 · 角色分工 · 资源协调 · 冲突解决          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ========================================
  // 演示 1: 基础协作设置
  // ========================================
  console.log('═'.repeat(60));
  console.log('演示 1: 创建多 Agent 协作环境');
  console.log('═'.repeat(60));

  // 创建共享的消息代理（单机模式）
  const broker = new InMemoryBroker();

  // 创建协调者 Agent
  const coordinatorId = uuidv4();
  const coordinator = new CollaborationLayer(coordinatorId, broker, true);
  await coordinator.initialize(AgentRole.COORDINATOR, [
    'task_decomposition',
    'resource_allocation',
    'conflict_resolution',
    'load_balancing'
  ]);
  console.log(`\n✅ 协调者 Agent 创建成功: ${coordinatorId.slice(0, 8)}...`);

  // 创建数据 Agent
  const dataAgentId = uuidv4();
  const dataAgent = new CollaborationLayer(dataAgentId, broker);
  await dataAgent.initialize(AgentRole.DATA_AGENT, [
    'data_extraction',
    'data_transformation',
    'data_loading',
    'schema_discovery'
  ]);
  console.log(`✅ 数据 Agent 创建成功: ${dataAgentId.slice(0, 8)}...`);

  // 创建 ETL Agent
  const etlAgentId = uuidv4();
  const etlAgent = new CollaborationLayer(etlAgentId, broker);
  await etlAgent.initialize(AgentRole.ETL_AGENT, [
    'etl_pipeline',
    'workflow_orchestration',
    'data_lineage'
  ]);
  console.log(`✅ ETL Agent 创建成功: ${etlAgentId.slice(0, 8)}...`);

  // 创建分析 Agent
  const analysisAgentId = uuidv4();
  const analysisAgent = new CollaborationLayer(analysisAgentId, broker);
  await analysisAgent.initialize(AgentRole.ANALYSIS_AGENT, [
    'data_analysis',
    'metrics_calculation',
    'statistical_modeling'
  ]);
  console.log(`✅ 分析 Agent 创建成功: ${analysisAgentId.slice(0, 8)}...`);

  // 注册所有 Agent 到协调者
  coordinator.registerAgent({
    id: dataAgentId,
    name: 'Data-Agent',
    role: AgentRole.DATA_AGENT,
    capabilities: ['data_extraction', 'data_transformation'],
    description: '负责数据抽取和转换',
    config: {}
  });

  coordinator.registerAgent({
    id: etlAgentId,
    name: 'ETL-Agent',
    role: AgentRole.ETL_AGENT,
    capabilities: ['etl_pipeline', 'workflow_orchestration'],
    description: '负责 ETL 流程编排',
    config: {}
  });

  coordinator.registerAgent({
    id: analysisAgentId,
    name: 'Analysis-Agent',
    role: AgentRole.ANALYSIS_AGENT,
    capabilities: ['data_analysis', 'metrics_calculation'],
    description: '负责数据分析和指标计算',
    config: {}
  });

  console.log('\n📋 已注册 Agent 列表:');
  const agents = coordinator.discoverAgents();
  agents.forEach((agent, i) => {
    console.log(`   ${i + 1}. ${agent.name} (${agent.role})`);
    console.log(`      能力: ${agent.capabilities.join(', ')}`);
  });

  // ========================================
  // 演示 2: 角色分工与任务分配
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 2: 角色分工与智能任务分配');
  console.log('═'.repeat(60));

  // 任务需求
  const taskRequirements = [
    { task: '数据抽取', requiredCapabilities: ['data_extraction'] },
    { task: 'ETL流程编排', requiredCapabilities: ['etl_pipeline'] },
    { task: '数据分析', requiredCapabilities: ['data_analysis'] },
  ];

  console.log('\n任务需求:');
  for (const req of taskRequirements) {
    console.log(`   • ${req.task} - 需要能力: ${req.requiredCapabilities.join(', ')}`);
    
    // 查找最佳匹配的 Agent
    const bestAgent = coordinator.findBestAgent(
      req.requiredCapabilities,
      AssignmentStrategy.CAPABILITY_MATCH
    );
    
    if (bestAgent) {
      console.log(`     → 分配给: ${bestAgent.name}`);
    } else {
      console.log(`     → 警告: 未找到匹配的 Agent`);
    }
  }

  // ========================================
  // 演示 3: 资源管理与冲突检测
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 3: 资源管理与冲突解决');
  console.log('═'.repeat(60));

  // 注册共享资源
  const resourceManager = coordinator.getManager().getResourceManager();
  
  resourceManager.registerResource({
    id: 'mysql_production_db',
    type: ResourceType.DATABASE,
    name: '生产环境 MySQL 数据库',
    priority: 90
  });

  resourceManager.registerResource({
    id: 'elasticsearch_cluster',
    type: ResourceType.DATABASE,
    name: 'Elasticsearch 集群',
    priority: 80
  });

  console.log('\n📦 已注册资源:');
  const resources = resourceManager.listResources();
  resources.forEach(r => {
    console.log(`   • ${r.name} (优先级: ${r.priority})`);
  });

  // 模拟资源冲突场景
  console.log('\n🔥 模拟资源冲突场景:');
  console.log('   数据 Agent (优先级 60) 请求 MySQL 数据库...');
  
  const request1 = await dataAgent.requestResource(
    ResourceType.DATABASE,
    { resourceId: 'mysql_production_db', priority: 60, duration: 5000 }
  );
  
  console.log(`   → 请求 ${request1.status === 'granted' ? '成功' : '失败'}`);

  // 另一个 Agent 请求同一资源（更高优先级）
  console.log('   协调者 Agent (优先级 95) 请求同一数据库...');
  
  const request2 = await coordinator.requestResource(
    ResourceType.DATABASE,
    { resourceId: 'mysql_production_db', priority: 95, duration: 3000 }
  );

  // 等待一下让冲突检测处理
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`   → 请求 ${request2.status === 'granted' ? '成功' : '失败'}`);
  
  if (request2.status === 'granted') {
    console.log('   → 高优先级请求成功抢占资源！');
  }

  // 释放资源
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // ========================================
  // 演示 4: 协作任务创建与执行
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 4: 创建协作任务');
  console.log('═'.repeat(60));

  // 设置任务处理器
  dataAgent.getManager().on('task:assigned', async (taskInfo) => {
    console.log(`\n📥 [Data Agent] 收到任务: ${taskInfo.description}`);
    
    // 模拟执行
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📤 [Data Agent] 提交任务结果`);
    await dataAgent.getManager().submitResult(
      taskInfo.taskId,
      taskInfo.subtaskId,
      { data: '抽取的数据', recordCount: 1000 }
    );
  });

  etlAgent.getManager().on('task:assigned', async (taskInfo) => {
    console.log(`\n📥 [ETL Agent] 收到任务: ${taskInfo.description}`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📤 [ETL Agent] 提交任务结果`);
    await etlAgent.getManager().submitResult(
      taskInfo.taskId,
      taskInfo.subtaskId,
      { status: 'transformed', records: 1000 }
    );
  });

  analysisAgent.getManager().on('task:assigned', async (taskInfo) => {
    console.log(`\n📥 [Analysis Agent] 收到任务: ${taskInfo.description}`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📤 [Analysis Agent] 提交任务结果`);
    await analysisAgent.getManager().submitResult(
      taskInfo.taskId,
      taskInfo.subtaskId,
      { metrics: { revenue: 100000, growth: 15 } }
    );
  });

  // 创建协作任务
  console.log('\n创建协作任务: "生成销售数据周报"');
  
  const collaborativeTask = await coordinator.createTask(
    '生成销售数据周报',
    [dataAgentId, etlAgentId, analysisAgentId],
    {
      strategy: AssignmentStrategy.CAPABILITY_MATCH,
      decompose: true
    }
  );

  console.log(`\n✅ 任务创建成功: ${collaborativeTask.id.slice(0, 8)}...`);
  console.log(`   目标: ${collaborativeTask.goal}`);
  console.log(`   参与者: ${collaborativeTask.participants.length} 个 Agent`);
  console.log(`   子任务: ${collaborativeTask.subtasks.size} 个`);

  // 显示子任务分配
  console.log('\n📋 子任务分配:');
  for (const [subtaskId, agentId] of collaborativeTask.subtasks) {
    const agent = coordinator.getRegistry().get(agentId);
    console.log(`   • ${subtaskId.slice(0, 8)}... → ${agent?.name || agentId.slice(0, 8)}...`);
  }

  // 等待任务完成
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ========================================
  // 演示 5: 消息通信
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 5: Agent 间消息通信');
  console.log('═'.repeat(60));

  // 设置消息处理器
  dataAgent.getManager().on('coordination', async (msg) => {
    console.log(`\n📨 [Data Agent] 收到协调消息:`);
    console.log(`   来自: ${msg.from.slice(0, 8)}...`);
    console.log(`   动作: ${msg.content.action}`);
  });

  // 发送协调消息
  console.log('\n发送协调消息...');
  await coordinator.sendMessage(
    'broadcast',
    MessageType.COORDINATION,
    {
      action: 'sync_request',
      timestamp: Date.now(),
      message: '请各 Agent 同步状态'
    }
  );

  await new Promise(resolve => setTimeout(resolve, 500));

  // ========================================
  // 演示 6: 状态广播
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 6: 状态广播与发现');
  console.log('═'.repeat(60));

  // 广播状态
  await dataAgent.broadcastStatus('active', {
    currentLoad: 0.3,
    memoryUsage: 0.5,
    activeTasks: 1
  });

  await etlAgent.broadcastStatus('active', {
    currentLoad: 0.5,
    memoryUsage: 0.6,
    activeTasks: 2
  });

  console.log('\n📊 Agent 状态已广播');

  // ========================================
  // 演示 7: 协商管理
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 7: 协商管理');
  console.log('═'.repeat(60));

  const negotiationManager = coordinator.getManager().getNegotiationManager();

  // 创建协商提案
  console.log('\n创建协商提案...');
  const proposal = negotiationManager.createProposal(
    coordinatorId,
    dataAgentId,
    'mysql_production_db',
    85,
    '需要临时使用数据库进行紧急查询',
    10000
  );

  console.log(`✅ 提案创建: ${proposal.id.slice(0, 8)}...`);
  console.log(`   提议者: ${proposal.proposerId.slice(0, 8)}...`);
  console.log(`   目标: ${proposal.targetId.slice(0, 8)}...`);
  console.log(`   提供的优先级: ${proposal.offeredPriority}`);

  // 模拟响应（实际应该由目标 Agent 响应）
  negotiationManager.respondToProposal(proposal.id, true, '接受让渡');
  
  const status = negotiationManager.getProposalStatus(proposal.id);
  console.log(`\n📋 提案状态:`);
  console.log(`   已响应: ${status.responded ? '是' : '否'}`);
  console.log(`   结果: ${status.accepted ? '接受' : '拒绝'}`);

  // ========================================
  // 清理
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示完成，正在清理...');
  console.log('═'.repeat(60));

  await coordinator.shutdown();
  await dataAgent.shutdown();
  await etlAgent.shutdown();
  await analysisAgent.shutdown();

  console.log('\n✅ 所有 Agent 已关闭\n');

  // ========================================
  // 总结
  // ========================================
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                        功能总结                             ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  ✅ 多 Agent 角色定义与分工                                  ║');
  console.log('║  ✅ 基于能力的智能任务分配                                   ║');
  console.log('║  ✅ 资源注册与冲突检测                                       ║');
  console.log('║  ✅ 优先级调度和资源抢占                                     ║');
  console.log('║  ✅ 协作任务创建与执行                                       ║');
  console.log('║  ✅ 点对点与广播通信                                         ║');
  console.log('║  ✅ 协商提案创建与响应                                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
