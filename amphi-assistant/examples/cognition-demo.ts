/**
 * 认知决策层增强功能演示
 * 
 * 展示内容:
 * 1. 语义增强的规划（通过 DependencyBuilder 自定义依赖逻辑）
 * 2. 不确定性处理（多假设追踪）
 * 3. 环境感知重规划
 * 4. 语义工具选择
 * 
 * 架构设计:
 * - 认知层 (src/core/cognition): 提供通用认知能力
 * - ETL Agent (agents/etl-agent): 提供 ETL 特定的依赖构建器
 */

import {
  OpenAILLMService,
  CognitionLayer,
  OntologyLayer,
  MemoryLayer,
  PlanningStrategy,
  SubTask,
  DependencyBuilder,
  ParsedIntent,
  EnvironmentChange,
} from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * 示例：自定义依赖构建器
 * 演示如何为特定场景实现依赖逻辑
 */
class DemoDependencyBuilder implements DependencyBuilder {
  buildDependencies(subtasks: SubTask[], context?: Record<string, any>): void {
    console.log('   🔧 自定义依赖构建器被调用');
    
    // 示例：基于任务名称的启发式依赖
    const setupTask = subtasks.find(t => t.name.toLowerCase().includes('setup'));
    const processTask = subtasks.find(t => t.name.toLowerCase().includes('process'));
    const cleanupTask = subtasks.find(t => t.name.toLowerCase().includes('cleanup'));
    
    if (setupTask && processTask && !processTask.dependencies.includes(setupTask.id)) {
      processTask.dependencies.push(setupTask.id);
      console.log(`      - ${processTask.name} 依赖 ${setupTask.name}`);
    }
    
    if (processTask && cleanupTask && !cleanupTask.dependencies.includes(processTask.id)) {
      cleanupTask.dependencies.push(processTask.id);
      console.log(`      - ${cleanupTask.name} 依赖 ${processTask.name}`);
    }
  }
}

async function main() {
  console.log('🧠 认知决策层增强功能演示\n');
  console.log('=' .repeat(60));
  console.log('架构: 核心认知层 + 场景特定的 DependencyBuilder');
  console.log('='.repeat(60));

  // 初始化基础服务
  const llm = new OpenAILLMService({
    apiKey: process.env.SILICONFLOW_API_KEY || '',
    model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V2.5',
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    temperature: 0.7,
  });

  // 初始化本体论层
  const ontologyLayer = new OntologyLayer();

  // 初始化认知层（通用能力）
  const cognition = new CognitionLayer(
    llm,
    {
      maxSubtasks: 10,
      defaultPriority: 2,
      maxRetries: 3,
      planningStrategy: PlanningStrategy.SEMANTIC,
      enableDynamicPlanning: true,
    },
    ontologyLayer
  );

  // 初始化记忆层和工作记忆
  const memoryLayer = new MemoryLayer({
    shortTerm: { type: 'memory', maxSize: 1000 },
    longTerm: { enabled: true },
  });
  const workingMemory = memoryLayer.createWorkingMemory('cognition-demo', 'demo-session');
  cognition.setWorkingMemory(workingMemory);

  console.log('\n✅ 认知层初始化完成');

  // ========================================
  // 演示 1: 语义增强的规划 + 自定义依赖构建
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('演示 1: 语义规划 + 自定义 DependencyBuilder');
  console.log('='.repeat(60));

  const intent: ParsedIntent = {
    action: 'data_processing_pipeline',
    confidence: 0.85,
    parameters: {
      source: 'raw_data',
      target: 'processed_data',
      steps: ['setup_environment', 'process_data', 'cleanup_temp'],
    },
  };

  console.log('\n📝 用户意图:', intent.action);
  
  // 使用自定义依赖构建器创建计划
  const customBuilder = new DemoDependencyBuilder();
  const plan = await cognition.plan(intent, { demo: true }, customBuilder);

  console.log('\n📋 生成的执行计划:');
  console.log(`   计划ID: ${plan.id.slice(0, 8)}...`);
  console.log(`   目标: ${plan.goal}`);
  console.log(`   子任务数: ${plan.subtasks.length}`);
  console.log(`   并行组数: ${plan.parallelGroups.length}`);
  
  if (plan.uncertainty) {
    console.log(`   整体置信度: ${(plan.uncertainty.overallConfidence * 100).toFixed(1)}%`);
  }

  console.log('\n📊 子任务详情:');
  plan.subtasks.forEach((task, i) => {
    const deps = task.dependencies.length > 0 
      ? ` (依赖: ${task.dependencies.map(d => d.slice(0, 4)).join(', ')})`
      : '';
    console.log(`   ${i + 1}. [${task.priority}] ${task.name}${deps}`);
  });

  // ========================================
  // 演示 2: 不确定性处理 - 多假设追踪
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('演示 2: 不确定性处理 (Uncertainty Handling)');
  console.log('='.repeat(60));

  // 添加多个假设
  const h1 = cognition.addHypothesis('方案A: 批处理模式', 0.7, ['适合大数据量']);
  const h2 = cognition.addHypothesis('方案B: 流处理模式', 0.5, ['实时性要求高']);
  const h3 = cognition.addHypothesis('方案C: 混合模式', 0.3, ['平衡方案']);

  console.log('\n🔍 生成的假设:');
  const allHypotheses = cognition.getAllHypotheses();
  allHypotheses.forEach((h, i) => {
    console.log(`   ${i + 1}. ${h.description} (${(h.confidence * 100).toFixed(0)}%)`);
  });

  const best = cognition.getBestHypothesis();
  console.log(`\n⭐ 最佳假设: ${best?.description} (${(best!.confidence * 100).toFixed(0)}%)`);

  // ========================================
  // 演示 3: 语义工具选择
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('演示 3: 语义工具选择 (Semantic Tool Selection)');
  console.log('='.repeat(60));

  const availableTools = [
    { name: 'batch_processor', description: '批处理大量数据', category: 'processor' },
    { name: 'stream_processor', description: '实时流处理', category: 'processor' },
    { name: 'data_validator', description: '验证数据质量', category: 'validator' },
  ];

  console.log('\n🔧 可用工具:');
  availableTools.forEach(t => console.log(`   - ${t.name} (${t.category}): ${t.description}`));

  const toolDecision = await cognition.selectTool(
    '处理每日10GB的日志数据',
    availableTools,
    { dataVolume: '10GB', frequency: 'daily' }
  );

  console.log('\n🎯 工具选择结果:');
  console.log(`   选中: ${toolDecision.selectedOption}`);
  console.log(`   置信度: ${(toolDecision.confidence * 100).toFixed(0)}%`);
  console.log(`   推理: ${toolDecision.reasoning}`);

  // ========================================
  // 演示 4: 环境感知重规划
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('演示 4: 环境感知重规划 (Environment-Aware Replanning)');
  console.log('='.repeat(60));

  const change: EnvironmentChange = {
    type: 'resource_unavailable',
    source: 'batch_processor',
    timestamp: Date.now(),
    details: { error: 'Service overloaded' },
    severity: 'high',
  };

  console.log('\n⚠️  环境变化事件:');
  console.log(`   类型: ${change.type}`);
  console.log(`   源: ${change.source}`);
  console.log(`   严重度: ${change.severity}`);

  const adjustedPlan = await cognition.replanForEnvironmentChange(plan, change);

  console.log('\n🔄 调整后的计划:');
  console.log(`   更新时间: ${new Date(adjustedPlan.updatedAt).toLocaleTimeString()}`);
  
  const affectedTasks = adjustedPlan.subtasks.filter(t => 
    t.tools?.includes('batch_processor') || t.uncertainty?.confidence! < 0.8
  );
  
  if (affectedTasks.length > 0) {
    console.log(`\n   受影响任务:`);
    affectedTasks.forEach(task => {
      console.log(`   - ${task.name}`);
      if (task.uncertainty) {
        console.log(`     置信度: ${(task.uncertainty.confidence * 100).toFixed(0)}%`);
      }
    });
  }

  // ========================================
  // 演示 5: 推理与本体论增强
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('演示 5: 推理与本体论增强 (ReAct + Ontology)');
  console.log('='.repeat(60));

  const reasoning = await cognition.reason(
    '如何优化大数据处理流水线的性能？',
    { dataVolume: '10GB', currentTime: '30min' },
    ['batch_processor', 'parallel_executor', 'cache_manager']
  );

  console.log('\n📊 推理结果:');
  console.log(`   推理链ID: ${reasoning.id.slice(0, 8)}...`);
  console.log(`   整体置信度: ${(reasoning.confidence * 100).toFixed(0)}%`);
  console.log(`   结论: ${reasoning.conclusion}`);

  console.log('\n   推理步骤:');
  reasoning.steps.forEach(step => {
    const conf = step.confidence ? ` (${(step.confidence * 100).toFixed(0)}%)` : '';
    console.log(`   ${step.step}. ${step.thought}${conf}`);
  });

  // ========================================
  // 总结
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('总结: 核心层通用能力 + 场景特定扩展');
  console.log('='.repeat(60));
  console.log('✅ 1. 认知层提供通用认知能力（规划、推理、决策）');
  console.log('✅ 2. DependencyBuilder 接口允许场景特定依赖逻辑');
  console.log('✅ 3. ETL Agent 在 agents/ 中实现 ETL 特定逻辑');
  console.log('✅ 4. 架构清晰分离：核心能力 vs 场景实现');
  console.log('\n🎯 设计理念: 核心层通用 + Agent 层特定');
  console.log('='.repeat(60));
}

main().catch(console.error);
