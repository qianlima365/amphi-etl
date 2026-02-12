/**
 * 反馈优化层功能演示
 * 
 * 展示反馈层的核心能力：
 * 1. 多维度结果评估
 * 2. 错误复盘与归因分析
 * 3. 经验规则提炼
 * 4. 模型微调数据收集
 */

import {
  FeedbackLayer,
  ResultEvaluator,
  ErrorAnalyzer,
  ErrorCategory,
  ExperienceExtractor,
  ModelFineTuningManager,
  EvaluationDimension,
} from '../src/core/feedback';
import { TaskExecutionResult } from '../src/core/execution';
import { MemoryLayer } from '../src/core/memory';
import { ExecutionPlan, TaskStatus } from '../src/types';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           反馈优化层 (Feedback Layer) 功能演示              ║');
  console.log('║     持续进化 · 经验沉淀 · 错误复盘 · 模型优化               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 初始化记忆层
  const memoryLayer = new MemoryLayer({
    shortTerm: { type: 'memory', maxSize: 1000 },
    longTerm: { enabled: true },
  });

  // 初始化反馈层
  const feedback = new FeedbackLayer({
    enableAutoEvaluation: true,
    enableExperienceExtraction: true,
    enableErrorAnalysis: true,
    enableFineTuning: true,
    enableHumanFeedback: true,
    minSamplesForFineTuning: 10,
    evaluationWeights: {
      completion: 0.25,
      accuracy: 0.25,
      efficiency: 0.2,
      reliability: 0.2,
      resourceUsage: 0.1,
    },
    thresholds: {
      completionRate: 0.9,
      accuracyScore: 0.85,
      efficiencyScore: 0.8,
      qualityScore: 80,
    },
  }, memoryLayer);

  // ========================================
  // 演示 1: 成功的任务评估
  // ========================================
  console.log('═'.repeat(60));
  console.log('演示 1: 成功的任务评估（高质量执行）');
  console.log('═'.repeat(60));

  const successfulPlan: ExecutionPlan = {
    id: uuidv4(),
    goal: 'MySQL 数据同步到 PostgreSQL',
    subtasks: [
      { id: uuidv4(), name: '连接验证', description: '验证数据库连接', dependencies: [], status: TaskStatus.COMPLETED, priority: 1, retryCount: 0, maxRetries: 3 },
      { id: uuidv4(), name: '数据抽取', description: '从MySQL抽取数据', dependencies: [], status: TaskStatus.COMPLETED, priority: 1, retryCount: 0, maxRetries: 3 },
      { id: uuidv4(), name: '数据转换', description: '转换数据格式', dependencies: [], status: TaskStatus.COMPLETED, priority: 2, retryCount: 0, maxRetries: 3 },
      { id: uuidv4(), name: '数据加载', description: '加载到PostgreSQL', dependencies: [], status: TaskStatus.COMPLETED, priority: 2, retryCount: 0, maxRetries: 3 },
    ],
    parallelGroups: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: TaskStatus.COMPLETED,
  };

  const successfulResults = new Map([
    [successfulPlan.subtasks[0].id, { taskId: successfulPlan.subtasks[0].id, success: true, duration: 500, retryCount: 0, output: { validation: { passed: true, score: 1 } } } as TaskExecutionResult],
    [successfulPlan.subtasks[1].id, { taskId: successfulPlan.subtasks[1].id, success: true, duration: 2000, retryCount: 0, output: { validation: { passed: true, score: 1 }, resourceUsage: { cpu: 0.3, memory: 0.4 } } } as TaskExecutionResult],
    [successfulPlan.subtasks[2].id, { taskId: successfulPlan.subtasks[2].id, success: true, duration: 1500, retryCount: 0, output: { validation: { passed: true, score: 1 } } } as TaskExecutionResult],
    [successfulPlan.subtasks[3].id, { taskId: successfulPlan.subtasks[3].id, success: true, duration: 1800, retryCount: 0, output: { validation: { passed: true, score: 1 } } } as TaskExecutionResult],
  ]);

  const successContext = {
    goal: 'MySQL 数据同步到 PostgreSQL',
    taskType: 'ETL',
    strategy: '并行执行',
    input: '从MySQL同步销售数据',
    output: '成功同步10000条记录',
  };

  const { evaluation: successEval, rules: successRules } = await feedback.processFeedback(
    successfulPlan,
    successfulResults,
    successContext
  );

  console.log('\n📊 评估结果:');
  console.log(`   综合质量分数: ${successEval.qualityScore}/100`);
  console.log(`   执行成功: ${successEval.success ? '✅' : '❌'}`);
  console.log(`\n📈 多维度指标:`);
  console.log(`   完成度: ${(successEval.multiDimensionMetrics.completion.rate * 100).toFixed(1)}%`);
  console.log(`   准确性: ${(successEval.multiDimensionMetrics.accuracy.overall * 100).toFixed(1)}%`);
  console.log(`   效率: ${(successEval.multiDimensionMetrics.efficiency.parallelismEfficiency * 100).toFixed(1)}%`);
  console.log(`   可靠性: ${(successEval.multiDimensionMetrics.reliability.stabilityScore * 100).toFixed(1)}%`);
  console.log(`\n💡 改进建议:`);
  successEval.improvementSuggestions.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  console.log(`\n📚 提炼经验规则: ${successRules.length} 条`);

  // ========================================
  // 演示 2: 失败的任务评估与复盘
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 2: 失败的任务评估与错误复盘');
  console.log('═'.repeat(60));

  const failedPlan: ExecutionPlan = {
    id: uuidv4(),
    goal: '大数据量ETL处理',
    subtasks: [
      { id: uuidv4(), name: '数据抽取', description: '抽取全量数据', dependencies: [], status: TaskStatus.FAILED, priority: 1, retryCount: 3, maxRetries: 3 },
      { id: uuidv4(), name: '数据清洗', description: '清洗数据', dependencies: [], status: TaskStatus.PENDING, priority: 2, retryCount: 0, maxRetries: 3 },
    ],
    parallelGroups: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: TaskStatus.FAILED,
  };

  const failedResults = new Map([
    [failedPlan.subtasks[0].id, { taskId: failedPlan.subtasks[0].id, success: false, duration: 30000, retryCount: 3, error: 'Connection timeout after 30000ms' } as TaskExecutionResult],
  ]);

  const failContext = {
    goal: '大数据量ETL处理',
    taskType: 'ETL',
    dataSize: 5000000,
    timeoutConfig: 30000,
    input: '处理500万条记录',
    output: '执行失败',
  };

  const { evaluation: failEval, postmortem, rules: failRules } = await feedback.processFeedback(
    failedPlan,
    failedResults,
    failContext
  );

  console.log('\n📊 评估结果:');
  console.log(`   综合质量分数: ${failEval.qualityScore}/100`);
  console.log(`   执行成功: ${failEval.success ? '✅' : '❌'}`);
  console.log(`\n📈 多维度指标:`);
  console.log(`   完成度: ${(failEval.multiDimensionMetrics.completion.rate * 100).toFixed(1)}%`);
  console.log(`   失败任务: ${failEval.multiDimensionMetrics.completion.failedTasks}`);
  console.log(`   重试任务: ${failEval.multiDimensionMetrics.completion.retriedTasks}`);

  if (postmortem) {
    console.log(`\n📋 复盘报告:`);
    console.log(`   摘要: ${postmortem.summary}`);
    console.log(`\n   🔍 错误分析:`);
    postmortem.failureAnalysis.forEach(err => {
      console.log(`      - [${err.category}] ${err.rootCause}`);
      console.log(`        严重程度: ${err.severity}, 可恢复: ${err.isRecoverable ? '是' : '否'}`);
      console.log(`        预防策略: ${err.preventionStrategy}`);
    });
    console.log(`\n   ✅ 行动项:`);
    postmortem.actionItems.forEach((item, i) => {
      console.log(`      ${i + 1}. [${item.priority}] ${item.description}`);
    });
  }

  // ========================================
  // 演示 3: 错误归因分析
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 3: 错误归因分析');
  console.log('═'.repeat(60));

  const errorAnalyzer = new ErrorAnalyzer();

  const testErrors = [
    { message: 'Connection timeout after 30000ms', context: { timeoutConfig: 30000, dataSize: 5000000 } },
    { message: 'Database connection refused', context: { targetService: 'mysql', networkLatency: 2000 } },
    { message: 'Tool execution failed: invalid parameter', context: { executionPhase: 'execution' } },
    { message: 'Memory limit exceeded', context: { memoryUsage: 0.95, concurrentTasks: 10 } },
  ];

  console.log('\n🔍 错误归因分析:');
  for (const testError of testErrors) {
    const analysis = errorAnalyzer.analyze(
      uuidv4(),
      new Error(testError.message),
      testError.context
    );

    console.log(`\n   错误: "${testError.message}"`);
    console.log(`   → 类型: ${analysis.category}`);
    console.log(`   → 根因: ${analysis.rootCause}`);
    console.log(`   → 严重程度: ${analysis.severity}`);
    console.log(`   → 可恢复: ${analysis.isRecoverable ? '✅' : '❌'}`);
  }

  // ========================================
  // 演示 4: 经验规则管理
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 4: 经验规则管理');
  console.log('═'.repeat(60));

  const extractor = new ExperienceExtractor(100, memoryLayer);

  // 模拟多次执行，积累规则
  for (let i = 0; i < 5; i++) {
    const mockEval = {
      success: i % 2 === 0,
      qualityScore: 60 + i * 10,
      multiDimensionMetrics: {
        completion: { rate: i % 2 === 0 ? 1 : 0.5, failedTasks: i % 2 === 0 ? 0 : 1, retriedTasks: 0 },
        accuracy: { overall: 0.8, validationResults: [] },
        efficiency: { totalDuration: 5000, avgTaskDuration: 2500, parallelismEfficiency: 0.7, timeDeviation: 0 },
        reliability: { stabilityScore: 0.85, errorRate: 0.15, recoverySuccessRate: 1 },
        resourceUsage: { cpuUtilization: 0.5, memoryUtilization: 0.6, ioEfficiency: 0.7, costEfficiency: 0.8 },
      },
      improvementSuggestions: i % 2 === 0 ? [] : ['优化超时配置'],
      lessons: i % 2 === 0 ? ['成功策略'] : ['需要改进'],
    } as any;

    const rules = extractor.extract(mockEval, {
      goal: '数据同步',
      taskType: 'ETL',
    });

    // 模拟规则应用成功
    rules.forEach(rule => {
      extractor.updateSuccess(rule.id, true);
    });
  }

  console.log('\n📚 经验规则统计:');
  const highConfidenceRules = extractor.getHighConfidence(0.5, 1);
  console.log(`   高置信度规则: ${highConfidenceRules.length} 条`);

  console.log('\n   规则列表:');
  highConfidenceRules.slice(0, 3).forEach((rule, i) => {
    console.log(`      ${i + 1}. ${rule.pattern}`);
    console.log(`         动作: ${rule.action}`);
    console.log(`         成功率: ${(rule.successRate * 100).toFixed(1)}% (${rule.applicationCount} 次应用)`);
  });

  // 查找适用规则
  const applicable = extractor.findApplicable({
    goal: '数据同步',
    taskType: 'ETL',
  });
  console.log(`\n   当前场景适用规则: ${applicable.length} 条`);

  // ========================================
  // 演示 5: 模型微调数据管理
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('演示 5: 模型微调数据管理');
  console.log('═'.repeat(60));

  const fineTuningManager = new ModelFineTuningManager();

  // 收集训练数据
  console.log('\n📊 收集训练数据...');
  for (let i = 0; i < 20; i++) {
    const mockEvaluation = {
      success: i % 3 !== 0,
      qualityScore: 50 + Math.random() * 50,
      multiDimensionMetrics: {} as any,
    };

    fineTuningManager.collect(
      `任务输入 ${i}`,
      `任务输出 ${i}`,
      { instruction: `执行任务 ${i}` },
      mockEvaluation
    );
  }

  const stats = fineTuningManager.getStats();
  console.log(`\n📈 数据统计:`);
  console.log(`   总样本: ${stats.total}`);
  console.log(`   正样本: ${stats.positive} (${(stats.positive / stats.total * 100).toFixed(1)}%)`);
  console.log(`   负样本: ${stats.negative}`);
  console.log(`   平均质量: ${stats.avgQuality.toFixed(1)}`);

  console.log(`\n   是否可以微调: ${fineTuningManager.canFineTune(10, 0.6) ? '✅ 是' : '❌ 否'}`);

  // 导出数据
  const highQualityData = fineTuningManager.getTrainingData({
    minQuality: 70,
    feedback: 'positive',
    limit: 5,
  });
  console.log(`\n📤 高质量正样本: ${highQualityData.length} 条`);

  // ========================================
  // 总结
  // ========================================
  console.log('\n' + '═'.repeat(60));
  console.log('总结');
  console.log('═'.repeat(60));

  const finalStats = feedback.getStats();
  console.log('\n✅ 反馈层功能演示完成');
  console.log(`   经验规则总数: ${finalStats.rules}`);
  console.log(`   微调数据总数: ${finalStats.trainingData.total}`);
  console.log(`   平均数据质量: ${finalStats.trainingData.avgQuality.toFixed(1)}`);

  console.log('\n🔄 持续进化流程:');
  console.log('   1. 执行任务 → 收集反馈数据');
  console.log('   2. 多维度评估 → 生成质量分数');
  console.log('   3. 错误分析 → 复盘报告');
  console.log('   4. 经验提炼 → 规则生成');
  console.log('   5. 数据积累 → 模型微调');
  console.log('   6. 能力提升 → 循环往复');
}

main().catch(console.error);
