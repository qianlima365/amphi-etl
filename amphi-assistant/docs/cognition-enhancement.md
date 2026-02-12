# 认知决策层 (Cognition Layer) 增强文档

## 概述

认知决策层是 AI Agent 框架的「大脑」，负责实现**目标分解、推理决策、工具选择**等核心功能。本次增强实现了「本体论+LLM」双轮驱动的决策机制。

**架构设计原则：**
- **核心层 (`src/core/cognition`)**: 只提供通用认知能力，不包含场景特定逻辑
- **Agent 层 (`agents/`)**: 实现场景特定的逻辑（如 ETL 依赖构建）
- 通过 `DependencyBuilder` 接口实现扩展点

## 核心增强功能

### 1. 语义增强的规划 (Semantic Planning)

**功能描述:**
- 集成本体论知识进行智能任务规划
- 支持通过 `DependencyBuilder` 接口自定义依赖逻辑
- 支持不确定性量化（任务级和计划级）

**关键类:**
```typescript
// 核心层提供通用规划器
class SemanticTaskPlanner {
  async createPlan(
    intent: ParsedIntent, 
    context?: Record<string, any>,
    dependencyBuilder?: DependencyBuilder  // 可选的依赖构建器
  ): Promise<ExecutionPlan>
}

// Agent 层实现特定的依赖构建器
interface DependencyBuilder {
  buildDependencies(subtasks: SubTask[], context?: Record<string, any>): void;
}
```

**使用示例（通用）:**
```typescript
// 基础用法（无自定义依赖）
const plan = await cognition.plan(intent, context);

// 使用自定义依赖构建器
const customBuilder: DependencyBuilder = {
  buildDependencies(subtasks, context) {
    // 自定义依赖逻辑
  }
};
const plan = await cognition.plan(intent, context, customBuilder);
```

**使用示例（ETL Agent）:**
```typescript
// agents/etl-agent.ts
class ETLDependencyBuilder implements DependencyBuilder {
  buildDependencies(subtasks: SubTask[], context?: Record<string, any>): void {
    // ETL 特定的依赖逻辑
    const conceptTypes = new Set(context?.semanticConcepts?.map(c => c.type));
    
    if (conceptTypes.has(ETLDomainOntology.CONCEPTS.DATA_SOURCE)) {
      // 数据源相关依赖...
    }
  }
}

// 在 ETL Agent 中使用
const plan = await this.cognition.plan(
  intent,
  context,
  this.etlDependencyBuilder  // ETL 特定的依赖构建器
);
```

---

### 2. 不确定性处理 (Uncertainty Handling)

**功能描述:**
- 多假设追踪器 (HypothesisTracker)
- 置信度评估与动态更新
- 不确定性决策支持

**关键类:**
```typescript
class HypothesisTracker {
  addHypothesis(description, initialConfidence, evidence): UUID
  updateConfidence(id, newConfidence): void
  addEvidence(id, evidence): void
  addContradiction(id, contradiction): void
  getBestHypothesis(): Hypothesis
}
```

**使用示例:**
```typescript
// 添加假设
const h1 = cognition.addHypothesis('方案A', 0.7, ['证据1']);
const h2 = cognition.addHypothesis('方案B', 0.5);

// 获取最佳假设
const best = cognition.getBestHypothesis();

// 不确定性决策
const decision = await cognition.resolveUncertainty(
  [{ description: '假设1', confidence: 0.6 }, ...],
  context
);
```

---

### 3. 语义工具选择 (Semantic Tool Selection)

**功能描述:**
- 基于本体论语义匹配选择最佳工具
- 考虑工具类别、描述、上下文相关性
- 提供备选方案和置信度

**关键类:**
```typescript
class SemanticDecisionEngine {
  async selectTool(
    taskDescription: string,
    availableTools: Tool[],
    context?: Record<string, any>
  ): Promise<Decision>
}
```

**使用示例:**
```typescript
const toolDecision = await cognition.selectTool(
  '处理每日10GB的日志数据',
  [
    { name: 'batch_processor', description: '批处理大量数据', category: 'processor' },
    { name: 'stream_processor', description: '实时流处理', category: 'processor' },
  ],
  { dataVolume: '10GB' }
);
```

---

### 4. 环境感知重规划 (Environment-Aware Replanning)

**功能描述:**
- 实时监控环境变化（资源可用性、状态变更等）
- 根据变化严重程度动态调整计划
- 支持完全重规划和局部调整

**关键类:**
```typescript
class SemanticTaskPlanner {
  async adjustPlanForEnvironmentChange(
    plan: ExecutionPlan,
    change: EnvironmentChange,
    workingMemory?: WorkingMemory
  ): Promise<ExecutionPlan>
}
```

**使用示例:**
```typescript
const change: EnvironmentChange = {
  type: 'resource_unavailable',
  source: 'mysql_connector',
  severity: 'high',
  details: { error: 'Connection timeout' },
  timestamp: Date.now()
};

const adjustedPlan = await cognition.replanForEnvironmentChange(plan, change);
```

---

### 5. 本体论增强推理 (Ontology-Enhanced ReAct)

**功能描述:**
- ReAct (Reasoning + Acting) 推理框架
- 集成领域本体论知识
- 推理过程可追溯

**关键类:**
```typescript
class ReActReasoner {
  async reason(
    goal: string,
    context: Record<string, any>,
    tools: string[],
    ontologyLayer?: OntologyLayer
  ): Promise<ReasoningChain>
}
```

**使用示例:**
```typescript
const reasoning = await cognition.reason(
  '如何优化大数据处理流水线的性能？',
  { dataVolume: '10GB' },
  ['batch_processor', 'parallel_executor']
);
```

---

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  Agent 层 (agents/etl-agent.ts)                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │        ETLDependencyBuilder                     │   │
│  │  - ETL 特定的依赖构建逻辑                        │   │
│  │  - 数据源→转换→目标的依赖链                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │        SmartETLAgent                            │   │
│  │  - 使用 cognition.plan(intent, ctx, builder)    │   │
│  │  - 传入 ETLDependencyBuilder                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  核心层 (src/core/cognition)                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │           CognitionLayer                        │   │
│  │  - plan(intent, context, dependencyBuilder?)    │   │
│  │  - reason(), selectTool(), resolveUncertainty() │   │
│  │  - replanForEnvironmentChange()                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │           SemanticTaskPlanner                   │   │
│  │  - 通用规划逻辑                                  │   │
│  │  - 调用 DependencyBuilder.buildDependencies()   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  HypothesisTracker | ReActReasoner | etc.       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
   ┌──────────────┐              ┌──────────────┐
   │ OntologyLayer │              │  MemoryLayer  │
   └──────────────┘              └──────────────┘
```

---

## 配置选项

```typescript
interface CognitionConfig {
  maxSubtasks: number;
  defaultPriority: TaskPriority;
  maxRetries: number;
  planningStrategy: PlanningStrategy;
  enableDynamicPlanning: boolean;
}

enum PlanningStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  ADAPTIVE = 'adaptive',
  SEMANTIC = 'semantic',  // 推荐
}
```

---

## 扩展指南：创建自定义 Agent

### 步骤 1: 实现 DependencyBuilder

```typescript
// agents/my-custom-agent.ts
import { DependencyBuilder, SubTask } from '../src';

class MyDependencyBuilder implements DependencyBuilder {
  buildDependencies(subtasks: SubTask[], context?: Record<string, any>): void {
    // 实现场景特定的依赖逻辑
    const step1 = subtasks.find(t => t.name.includes('step1'));
    const step2 = subtasks.find(t => t.name.includes('step2'));
    
    if (step1 && step2) {
      step2.dependencies.push(step1.id);
    }
  }
}
```

### 步骤 2: 在 Agent 中使用认知层

```typescript
class MyCustomAgent {
  private cognition: CognitionLayer;
  private dependencyBuilder = new MyDependencyBuilder();
  
  async planTask(intent: ParsedIntent) {
    // 使用通用认知层 + 特定依赖构建器
    const plan = await this.cognition.plan(
      intent,
      { /* context */ },
      this.dependencyBuilder  // 传入自定义依赖构建器
    );
    return plan;
  }
}
```

---

## 与 ETL Agent 集成示例

完整实现见 `agents/etl-agent.ts`:

```typescript
class SmartETLAgent {
  private cognition: CognitionLayer;
  private etlDependencyBuilder = new ETLDependencyBuilder();
  
  // 初始化认知层
  private initCognitionLayer(ontologyLayer: OntologyLayer): void {
    this.cognition = new CognitionLayer(
      this.llm,
      {
        planningStrategy: PlanningStrategy.SEMANTIC,
        enableDynamicPlanning: true,
      },
      ontologyLayer
    );
  }
  
  // 使用认知层创建 ETL 计划
  async createETLPlanWithCognition(): Promise<ExecutionPlan | null> {
    const intent = {
      action: 'create_etl_pipeline',
      confidence: 0.9,
      parameters: {
        source: this.config.input?.name,
        target: this.config.output?.name,
        transformations: this.config.transformations.map(t => t.name),
      },
    };

    // 关键：传入 ETL 特定的依赖构建器
    const plan = await this.cognition.plan(
      intent,
      context,
      this.etlDependencyBuilder
    );

    return plan;
  }
}
```

---

## 性能与限制

| 功能 | 时间复杂度 | 空间复杂度 | 备注 |
|------|-----------|-----------|------|
| 语义规划 | O(n²) | O(n) | n = 子任务数 |
| 工具选择 | O(m) | O(1) | m = 工具数量 |
| 假设追踪 | O(k) | O(k) | k = 假设数量 |
| 环境重规划 | O(n²) | O(n) | 完全重规划时 |

**注意事项:**
- LLM 调用会增加延迟（通常 1-3 秒）
- 假设数量建议控制在 10 个以内
- 复杂计划（>50 子任务）建议分阶段规划
