# 协作层快速入门

## 1. 创建 Agent 集群

```typescript
import {
  CollaborationLayer,
  AgentRole,
  InMemoryBroker,
} from './src/core/collaboration';

// 创建消息代理
const broker = new InMemoryBroker();

// 创建协调者
const coordinator = new CollaborationLayer('coordinator-1', broker, true);
await coordinator.initialize(AgentRole.COORDINATOR);

// 创建工作 Agent
const worker1 = new CollaborationLayer('worker-1', broker);
await worker1.initialize(AgentRole.WORKER, ['data_processing']);

const worker2 = new CollaborationLayer('worker-2', broker);
await worker2.initialize(AgentRole.WORKER, ['data_analysis']);
```

## 2. 注册和发现 Agent

```typescript
// 注册 Agent
coordinator.registerAgent({
  id: worker1.agentId,
  name: 'Worker-1',
  role: AgentRole.WORKER,
  capabilities: ['data_processing'],
  description: '数据处理 Agent',
  config: {}
});

// 发现 Agent
const allAgents = coordinator.discoverAgents();
const dataAgents = coordinator.discoverAgents('data_processing');
```

## 3. 创建协作任务

```typescript
// 创建任务并自动分解
const task = await coordinator.createTask(
  '数据分析报告',
  [worker1.agentId, worker2.agentId],
  {
    strategy: AssignmentStrategy.CAPABILITY_MATCH,
    decompose: true
  }
);
```

## 4. 资源管理

```typescript
// 注册资源
const resourceManager = coordinator.getManager().getResourceManager();
resourceManager.registerResource({
  id: 'database_1',
  type: ResourceType.DATABASE,
  name: '主数据库',
  priority: 80
});

// 请求资源
const request = await worker1.requestResource(
  ResourceType.DATABASE,
  { resourceId: 'database_1', priority: 70, duration: 60000 }
);

// 释放资源
worker1.getManager().releaseResource(request.id);
```

## 5. 消息通信

```typescript
// 发送消息
await coordinator.sendMessage(
  worker1.agentId,
  MessageType.TASK_ASSIGN,
  { taskId: 'task_001', description: '处理数据' }
);

// 广播状态
await coordinator.broadcastStatus('active', { load: 0.5 });

// 接收消息
worker1.getManager().on('task:assigned', async (msg) => {
  console.log('收到任务:', msg.content);
});
```

## 6. 分布式部署

```typescript
import { KafkaBroker } from './src/core/collaboration';
import { Kafka } from 'kafkajs';

// 使用 Kafka 作为消息代理（支持分布式）
const kafka = new Kafka({ brokers: ['kafka:9092'] });
const broker = new KafkaBroker(kafka);

const agent1 = new CollaborationLayer('agent-1', broker);
const agent2 = new CollaborationLayer('agent-2', broker); // 可在不同机器上
```

## 企业级场景

### 数据智能平台协作

```
Coordinator Agent
      │
      ├─► Data Agent: 数据抽取
      │
      ├─► ETL Agent: 数据转换
      │
      ├─► Analysis Agent: 指标计算
      │
      └─► Viz Agent: 报告生成
```

```typescript
// 企业级多 Agent 协作示例
const dataAgent = new CollaborationLayer('data-1', broker);
await dataAgent.initialize(AgentRole.DATA_AGENT);

const etlAgent = new CollaborationLayer('etl-1', broker);
await etlAgent.initialize(AgentRole.ETL_AGENT);

const analysisAgent = new CollaborationLayer('analysis-1', broker);
await analysisAgent.initialize(AgentRole.ANALYSIS_AGENT);

// 创建数据管道任务
const pipelineTask = await coordinator.createTask(
  '构建销售数据管道',
  [dataAgent.agentId, etlAgent.agentId, analysisAgent.agentId],
  { decompose: true }
);
```
