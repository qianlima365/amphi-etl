# Node.js AI Agent 开发框架

基于「核心功能+技术选型全解析」文档实现的企业级 AI Agent 开发框架。

## 核心特性

- **六大功能模块完整实现**
  - 感知层 (Perception Layer)
  - 记忆层 (Memory Layer)
  - 认知决策层 (Cognition Layer)
  - 执行层 (Execution Layer)
  - 协作层 (Collaboration Layer)
  - 反馈优化层 (Feedback Layer)

- **本体论 + LLM 结合**
  - ETL 领域本体支持
  - 知识图谱集成
  - 语义决策支持

- **ETL 场景专项支持**
  - 自动生成 ETL 工作流
  - 数据血缘追踪
  - 数据质量验证

- **OpenAI 协议支持**
  - 支持硅基流动(SiliconFlow)等兼容 OpenAI API 的服务商
  - 灵活配置模型参数
  - 流式响应支持

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Agent 核心层                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ 感知层   │  │ 记忆层   │  │ 认知层   │  │ 执行层   │         │
│  │ Perceive │  │ Memory   │  │ Plan     │  │ Execute  │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│        │             │             │             │               │
│        └─────────────┴─────────────┴─────────────┘               │
│                         │                                        │
│  ┌──────────────────────┴──────────────────────┐                 │
│  │              协作层 (Collaboration)          │                 │
│  └──────────────────────┬──────────────────────┘                 │
│                         │                                        │
│  ┌──────────────────────┴──────────────────────┐                 │
│  │            反馈优化层 (Feedback)             │                 │
│  └─────────────────────────────────────────────┘                 │
│                                                                  │
│  ┌─────────────────────────────────────────────┐                 │
│  │        本体论语义层 (Ontology)              │                 │
│  └─────────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件配置你的 LLM 服务和其他组件
```

### 3. 运行示例

**⚠️ 注意**: `npm run dev` 命令不支持直接传入示例文件路径，因为 `package.json` 中的 `dev` 脚本是固定的。以下是三种正确的运行方式：

#### 方式1：直接运行（推荐）

使用 `ts-node` 直接运行示例文件：

```bash
# ETL Agent 示例
npx ts-node examples/etl-agent-example.ts

# 多 Agent 协作示例
npx ts-node examples/multi-agent-example.ts
```

#### 方式2：添加到 package.json 脚本

在 `package.json` 的 `scripts` 部分添加专用脚本：

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "example:etl": "ts-node examples/etl-agent-example.ts",
    "example:multi": "ts-node examples/multi-agent-example.ts"
  }
}
```

然后运行：

```bash
# ETL Agent 示例
npm run example:etl

# 多 Agent 协作示例
npm run example:multi
```

#### 方式3：先构建再运行

先编译 TypeScript，然后运行编译后的 JS：

```bash
# 1. 构建项目
npm run build

# 2. 运行编译后的示例
node dist/examples/etl-agent-example.js
```

**注意**: 确保在运行前已配置 `.env` 文件中的 `SILICONFLOW_API_KEY` 环境变量。

## 基本使用

### 创建 Agent

```typescript
import { Agent, AgentRole } from 'nodejs-agent-framework';

const agent = new Agent(
  {
    name: 'MyAgent',
    role: AgentRole.SPECIALIST,
    capabilities: ['data_processing', 'analysis'],
  },
  frameworkConfig,
  llmService
);

await agent.initialize();
```

### 注册工具

```typescript
agent.registerTool({
  name: 'my_tool',
  description: 'My tool description',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string' },
    },
  },
  handler: async (params, context) => {
    // 工具实现
    return { success: true, data: result };
  },
});
```

### 处理任务

```typescript
// 处理自然语言指令
const result = await agent.process('创建从生产库到数据仓库的ETL任务');

// 处理 ETL 专用请求
const etlResult = await agent.processETL(
  'ProductionDB',           // 数据源
  'DataWarehouse',          // 数据目标
  ['transform1', 'validate'] // 转换规则
);
```

### 多 Agent 协作

```typescript
// 创建协作任务
const taskId = await coordinatorAgent.collaborate(
  '生成月度销售报告',
  [dataAgentId, analysisAgentId]
);
```

## 配置选项

### Agent 配置

```typescript
interface AgentConfig {
  id?: string;           // Agent ID (可选，自动生成)
  name: string;          // Agent 名称
  role: AgentRole;       // 角色 (COORDINATOR/WORKER/SPECIALIST)
  capabilities: string[]; // 能力列表
  description?: string;  // 描述
}
```

### 框架配置

```typescript
interface AgentFrameworkConfig {
  agent: { ... };        // Agent 基本信息
  llm: {                 // LLM 配置 - 仅支持 OpenAI 协议
    provider: 'openai';
    model: string;       // 如: 'deepseek-ai/DeepSeek-V2.5'
    baseUrl?: string;    // 如: 'https://api.siliconflow.cn/v1'
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  };
  memory: {              // 记忆层配置
    shortTerm: { ... };
    longTerm: { ... };
    vector: { ... };
  };
  execution: {           // 执行层配置
    maxConcurrentTasks: number;
    defaultTimeout: number;
    retryPolicy: { ... };
  };
}
```

## 各模块详解

### 感知层 (Perception Layer)

- 多模态输入解析
- 意图识别
- 环境状态感知

```typescript
const perception = agent.getPerceptionLayer();
const input = await perception.perceive('用户输入');
const intent = await perception.parseIntent(input);
```

### 记忆层 (Memory Layer)

- 短期记忆 (工作记忆)
- 长期记忆 (经验记忆)
- 向量存储 (语义记忆)

```typescript
const memory = agent.getMemoryLayer();
await memory.store('内容', MemoryType.LONG_TERM, { tags: ['important'] });
const results = await memory.retrieve({ content: '查询', topK: 5 });
```

### 认知决策层 (Cognition Layer)

- 目标拆解与规划
- 动态调整
- 工具选择

```typescript
const cognition = agent.getCognitionLayer();
const plan = await cognition.plan(intent);
const adjustedPlan = await cognition.replan(plan, failedTaskId, error);
```

### 执行层 (Execution Layer)

- 工具调用
- 代码执行
- 任务调度

```typescript
const execution = agent.getExecutionLayer();
execution.registerTool(tool);
const result = await execution.executeTask(task, context);
```

### 协作层 (Collaboration Layer)

- 多 Agent 通信
- 任务分配
- 资源协调

```typescript
const collaboration = agent.getCollaborationLayer();
await collaboration.initialize();
await collaboration.sendMessage(targetId, MessageType.TASK_ASSIGN, content);
```

### 反馈优化层 (Feedback Layer)

- 结果评估
- 经验提炼
- 微调数据收集

```typescript
const feedback = agent.getFeedbackLayer();
const evaluation = feedback.evaluate(plan, results);
const rules = feedback.extractExperience(evaluation, context);
```

### 本体论语义层 (Ontology Layer)

- 概念管理
- ETL 领域本体
- 语义决策支持

```typescript
const ontology = agent.getOntologyLayer();
const helper = ontology.getETLHelper();

// 注册数据源
const sourceId = helper.registerDataSource('MyDB', 'PostgreSQL', {...});

// 自动匹配转换规则
const mappings = helper.autoMatchTransformations(sourceSchema, targetSchema);
```

## ETL 场景示例

```typescript
// 1. 配置 ETL 本体
const ontology = agent.getOntologyLayer().getETLHelper();
ontology.registerDataSource('SourceDB', 'PostgreSQL', {...});
ontology.registerDataSource('TargetDB', 'ClickHouse', {...});
ontology.registerTransformation('Transform1', 'aggregation', ...);

// 2. 执行 ETL
const result = await agent.processETL(
  'SourceDB',
  'TargetDB',
  ['Transform1', 'ValidateData']
);

// 3. 获取数据血缘
const lineage = ontology.getDataLineage(fieldId);
console.log('上游:', lineage.upstream);
console.log('下游:', lineage.downstream);
console.log('转换:', lineage.transformations);
```

## 技术栈

- **核心**: TypeScript, Node.js 18+
- **LLM**: OpenAI 协议 API (硅基流动等兼容服务商)
- **存储**: Redis (短期), PostgreSQL (长期), ChromaDB/Milvus (向量)
- **知识图谱**: Neo4j, NebulaGraph
- **消息队列**: Kafka (多 Agent 协作)
- **部署**: Docker, Kubernetes

## 项目结构

```
nodejs-agent-framework/
├── src/
│   ├── core/              # 核心模块
│   │   ├── Agent.ts       # 核心 Agent 类
│   │   ├── perception/    # 感知层
│   │   ├── memory/        # 记忆层
│   │   ├── cognition/     # 认知决策层
│   │   ├── execution/     # 执行层
│   │   ├── collaboration/ # 协作层
│   │   ├── feedback/      # 反馈优化层
│   │   └── ontologies/    # 本体论语义层
│   ├── types/             # 类型定义
│   └── utils/             # 工具函数
├── examples/              # 示例代码
├── tests/                 # 测试用例
└── docker/                # 部署配置
```

## License

MIT
