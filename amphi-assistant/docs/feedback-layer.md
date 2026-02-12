# 反馈优化层 (Feedback Layer) 架构文档

## 概述

反馈优化层是 Agent 框架的"学习能力"，负责从任务执行结果中持续进化。通过多维度评估、经验提炼、错误复盘和模型微调，让 Agent 具备持续改进的能力。

### 核心设计理念

```
执行任务 → 多维度评估 → 错误分析/经验提炼 → 知识沉淀 → 模型优化 → 持续进化
```

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     FeedbackLayer                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               ResultEvaluator                           │   │
│  │  • 多维度评估（完成度/准确性/效率/可靠性/资源使用）      │   │
│  │  • 综合质量分数计算                                      │   │
│  │  • 改进建议生成                                          │   │
│  │  • 历史表现对比                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               ErrorAnalyzer                             │   │
│  │  • 错误分类（8大类错误类型）                             │   │
│  │  • 根因分析                                              │   │
│  │  • 复盘报告生成                                          │   │
│  │  • 预防策略推荐                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ExperienceExtractor                        │   │
│  │  • 成功经验提炼                                          │   │
│  │  • 规则生成与存储                                        │   │
│  │  • 规则匹配与应用                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           ModelFineTuningManager                        │   │
│  │  • 训练数据收集                                          │   │
│  │  • 多格式导出（Alpaca/ShareGPT/OpenAI）                  │   │
│  │  • 质量筛选                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 核心能力

### 1. 结果评估（ResultEvaluator）

#### 评估维度

| 维度 | 指标 | 说明 |
|------|------|------|
| **完成度** | 完成率、失败任务数、重试任务数 | 任务整体完成情况 |
| **准确性** | 整体准确性、验证结果列表 | 结果正确程度 |
| **效率** | 总耗时、平均耗时、并行效率、时间偏差 | 执行效率评估 |
| **可靠性** | 稳定性分数、错误率、恢复成功率 | 系统稳定性 |
| **资源使用** | CPU/内存利用率、IO效率、成本效率 | 资源利用情况 |

#### 综合质量分数

```typescript
qualityScore = 
  completion.rate × 0.25 +
  accuracy.overall × 0.25 +
  reliability.stabilityScore × 0.20 +
  efficiency.parallelismEfficiency × 0.20 +
  (1 - resourceUsage.cpuUtilization) × 0.10
```

#### 使用示例

```typescript
const feedback = new FeedbackLayer(config, memoryLayer);

const { evaluation } = await feedback.processFeedback(
  plan,
  executionResults,
  { goal: '数据同步任务', input, output }
);

console.log('质量分数:', evaluation.qualityScore);
console.log('改进建议:', evaluation.improvementSuggestions);
console.log('历史对比:', evaluation.comparableHistory);
```

### 2. 错误复盘（ErrorAnalyzer）

#### 错误分类

```typescript
enum ErrorCategory {
  PLANNING_ERROR = 'planning_error',       // 规划错误
  TOOL_ERROR = 'tool_error',               // 工具调用错误
  EXECUTION_ERROR = 'execution_error',     // 执行错误
  ENVIRONMENT_ERROR = 'environment_error', // 环境问题
  RESOURCE_ERROR = 'resource_error',       // 资源问题
  TIMEOUT_ERROR = 'timeout_error',         // 超时错误
  DATA_ERROR = 'data_error',               // 数据问题
  UNKNOWN_ERROR = 'unknown_error',         // 未知错误
}
```

#### 复盘报告

```typescript
interface PostMortemReport {
  id: UUID;
  planId: UUID;
  summary: string;              // 执行摘要
  successFactors: string[];     // 成功因素
  failureAnalysis: ErrorRootCause[];  // 错误分析
  lessonsLearned: string[];     // 经验教训
  actionItems: ActionItem[];    // 行动项
  knowledgeGained: ExperienceRule[];  // 获得的知识
}
```

#### 使用示例

```typescript
// 自动分析错误
const errorAnalysis = errorAnalyzer.analyze(
  taskId,
  error,
  { executionPhase: 'execution', dataSize: 1000000 }
);

console.log('错误类型:', errorAnalysis.category);
console.log('根因:', errorAnalysis.rootCause);
console.log('预防策略:', errorAnalysis.preventionStrategy);

// 生成复盘报告
const report = errorAnalyzer.generatePostMortem(plan, results, evaluation);
```

### 3. 经验提炼（ExperienceExtractor）

#### 经验规则

```typescript
interface ExperienceRule {
  id: UUID;
  pattern: string;           // 模式描述
  condition: Record<string, any>;  // 适用条件
  action: string;            // 建议动作
  successRate: number;       // 成功率
  applicationCount: number;  // 应用次数
  createdAt: Timestamp;
  lastApplied: Timestamp;
  metadata?: Record<string, any>;  // 元数据
}
```

#### 规则类型

1. **成功策略规则**：高质量执行的策略复用
2. **改进建议规则**：从问题中提取的改进方案
3. **维度优化规则**：特定维度的优化策略

#### 使用示例

```typescript
// 提炼经验
const rules = feedback.experienceExtractor.extract(evaluation, context);

// 查找适用规则
const applicableRules = feedback.getApplicableRules({
  goal: '数据同步',
  taskType: 'ETL'
});

// 获取高置信度规则
const highConfidenceRules = feedback.experienceExtractor.getHighConfidence(
  0.8,  // 最小成功率
  3     // 最小应用次数
);
```

### 4. 模型微调（ModelFineTuningManager）

#### 数据收集

```typescript
// 自动收集训练数据
feedback.processFeedback(plan, results, context);
// 自动收集到 fineTuningManager
```

#### 数据导出格式

```typescript
// Alpaca 格式
[
  {
    "instruction": "执行数据同步任务",
    "input": "从MySQL同步到PostgreSQL",
    "output": "成功完成，耗时5秒",
    "metadata": { "qualityScore": 95, "feedback": "positive" }
  }
]

// ShareGPT 格式
[
  {
    "conversations": [
      { "from": "system", "value": "执行数据同步任务" },
      { "from": "human", "value": "从MySQL同步到PostgreSQL" },
      { "from": "gpt", "value": "成功完成，耗时5秒" }
    ]
  }
]
```

#### 使用示例

```typescript
// 导出训练数据
const alpacaData = feedback.exportTrainingData('alpaca', 'high');
const sharegptData = feedback.exportTrainingData('sharegpt', 'all');

// 检查是否可以微调
if (feedback.canFineTune()) {
  console.log('可以开始微调模型');
}

// 获取统计
const stats = feedback.fineTuningManager.getStats();
console.log(`总样本: ${stats.total}, 正样本: ${stats.positive}`);
```

## 完整反馈流程

```typescript
// 完整反馈流程
const feedback = new FeedbackLayer({
  enableAutoEvaluation: true,
  enableExperienceExtraction: true,
  enableErrorAnalysis: true,
  enableFineTuning: true,
}, memoryLayer);

// 执行完整反馈流程
const { evaluation, postmortem, rules } = await feedback.processFeedback(
  plan,
  results,
  context
);

// 评估结果包含：
// - 多维度指标
// - 综合质量分数
// - 改进建议
// - 历史对比

// 复盘报告包含（如果有失败）：
// - 错误根因分析
// - 预防策略
// - 行动项

// 经验规则：
// - 成功策略
// - 改进建议

// 同时自动：
// - 收集微调数据
// - 同步到记忆层
```

## 人工反馈整合

```typescript
// 添加人工反馈
feedback.addHumanFeedback(evaluationId, {
  rater: 'user_001',
  overallRating: 4,  // 1-5分
  dimensionRatings: {
    [EvaluationDimension.COMPLETION]: 5,
    [EvaluationDimension.ACCURACY]: 4,
    [EvaluationDimension.EFFICIENCY]: 3,
  },
  comments: '整体不错，但速度可以更快',
  suggestedImprovements: ['优化并行执行'],
});
```

## 配置选项

```typescript
const config: Partial<FeedbackConfig> = {
  enableAutoEvaluation: true,       // 启用自动评估
  enableExperienceExtraction: true, // 启用经验提炼
  enableErrorAnalysis: true,        // 启用错误分析
  enableFineTuning: true,           // 启用微调数据收集
  enableHumanFeedback: true,        // 启用人工反馈
  minSamplesForFineTuning: 100,     // 微调最小样本数
  evaluationWeights: {              // 评估权重
    completion: 0.25,
    accuracy: 0.25,
    efficiency: 0.2,
    reliability: 0.2,
    resourceUsage: 0.1,
  },
  thresholds: {                     // 阈值
    completionRate: 0.9,
    accuracyScore: 0.85,
    efficiencyScore: 0.8,
    qualityScore: 80,
  },
};
```

## 集成示例

### 与执行层集成

```typescript
// 执行完成后立即评估
const executionResults = await executionLayer.executePlan(plan, context);
const { evaluation } = await feedback.processFeedback(plan, executionResults, context);

if (!evaluation.success) {
  console.log('执行未达预期:', evaluation.improvementSuggestions);
}
```

### 与记忆层集成

```typescript
// 经验自动同步到记忆层
const feedback = new FeedbackLayer(config, memoryLayer);

// 提取的经验规则会自动存入记忆层
const rules = feedback.experienceExtractor.extract(evaluation, context);
```

### 与协作层集成

```typescript
// 多 Agent 共享经验
collaboration.broadcastStatus('experience_update', {
  rules: feedback.experienceExtractor.getHighConfidence(0.9, 5),
});
```

## 持续进化流程

```
第一次执行
    ↓
收集反馈数据
    ↓
生成经验规则
    ↓
第二次执行（应用规则）
    ↓
评估效果提升
    ↓
更新规则成功率
    ↓
高置信度规则固化
    ↓
模型微调数据积累
    ↓
模型微调优化
    ↓
决策能力提升
    ↓
持续循环...
```

## 最佳实践

1. **定期复盘**：对重要任务生成复盘报告
2. **经验共享**：高置信度规则在 Agent 集群中共享
3. **数据积累**：持续收集训练数据用于模型优化
4. **人工校正**：关键决策引入人工反馈
5. **监控趋势**：关注质量分数的历史趋势

## 性能考虑

- 评估过程是异步的，不影响主流程
- 经验规则使用 LRU 淘汰，控制内存使用
- 训练数据自动去重和筛选
- 支持配置最大规则数和训练数据量
