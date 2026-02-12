# 反馈优化层快速入门

## 1. 基础使用

### 初始化反馈层

```typescript
import { FeedbackLayer } from './src/core/feedback';
import { MemoryLayer } from './src/core/memory';

const memoryLayer = new MemoryLayer({
  shortTerm: { type: 'memory', maxSize: 1000 },
  longTerm: { enabled: true },
});

const feedback = new FeedbackLayer({
  enableAutoEvaluation: true,
  enableExperienceExtraction: true,
  enableErrorAnalysis: true,
  enableFineTuning: true,
}, memoryLayer);
```

### 执行反馈流程

```typescript
const { evaluation, postmortem, rules } = await feedback.processFeedback(
  plan,           // 执行计划
  results,        // 执行结果
  context         // 上下文信息
);

console.log('质量分数:', evaluation.qualityScore);
console.log('改进建议:', evaluation.improvementSuggestions);
```

## 2. 多维度评估

```typescript
// 获取详细指标
const metrics = evaluation.multiDimensionMetrics;

console.log('完成度:', metrics.completion.rate);
console.log('准确性:', metrics.accuracy.overall);
console.log('效率:', metrics.efficiency.parallelismEfficiency);
console.log('可靠性:', metrics.reliability.stabilityScore);
console.log('资源使用:', metrics.resourceUsage.cpuUtilization);
```

## 3. 错误复盘

```typescript
// 当任务失败时，自动生成复盘报告
if (!evaluation.success) {
  const report = postmortem;
  
  console.log('错误分析:');
  report.failureAnalysis.forEach(err => {
    console.log(`- ${err.category}: ${err.rootCause}`);
    console.log(`  预防策略: ${err.preventionStrategy}`);
  });
  
  console.log('行动项:');
  report.actionItems.forEach(item => {
    console.log(`- [${item.priority}] ${item.description}`);
  });
}
```

## 4. 经验规则

```typescript
// 获取适用规则
const rules = feedback.getApplicableRules({
  goal: '数据同步',
  taskType: 'ETL',
});

// 应用规则
rules.forEach(rule => {
  console.log(`建议动作: ${rule.action}`);
  console.log(`成功率: ${rule.successRate}`);
});
```

## 5. 模型微调数据

```typescript
// 导出训练数据
const trainingData = feedback.exportTrainingData('alpaca', 'high');

// 检查是否可以微调
if (feedback.canFineTune()) {
  console.log('可以开始模型微调');
}

// 获取统计
const stats = feedback.getStats();
console.log(`样本数: ${stats.trainingData.total}`);
```

## 6. 人工反馈

```typescript
feedback.addHumanFeedback(evaluationId, {
  rater: 'user_001',
  overallRating: 4,  // 1-5分
  dimensionRatings: {
    completion: 5,
    accuracy: 4,
    efficiency: 3,
  },
  comments: '整体不错，速度可以更快',
  suggestedImprovements: ['优化并行执行'],
});
```

## 完整示例

```typescript
import { FeedbackLayer } from './src';

async function executeWithFeedback(plan, context) {
  // 1. 执行计划
  const results = await executePlan(plan);
  
  // 2. 反馈评估
  const { evaluation, postmortem, rules } = await feedback.processFeedback(
    plan,
    results,
    context
  );
  
  // 3. 处理结果
  if (evaluation.success) {
    console.log('✅ 执行成功，质量分数:', evaluation.qualityScore);
    console.log('💡 经验规则:', rules.length, '条');
  } else {
    console.log('❌ 执行未达预期');
    console.log('📋 复盘报告:', postmortem?.summary);
  }
  
  return evaluation;
}
```
