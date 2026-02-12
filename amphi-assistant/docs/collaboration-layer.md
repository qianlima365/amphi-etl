# 协作层 (Collaboration Layer) 架构文档

## 概述

协作层是 Agent 框架的"社交能力"，支持多 Agent 协同完成复杂任务。它是构建 **Agent 集群 / Agent 生态** 的基础，特别适用于企业级复杂场景。

### 核心设计理念

```
单 Agent 能力不足 → 多 Agent 协作 → 角色分工 → 智能协调
```

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     CollaborationLayer                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CollaborationManager                       │   │
│  │  • 消息路由    • 任务协调    • 状态同步                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │   AgentRegistry     │  │     ResourceManager         │   │
│  │  • Agent注册        │  │  • 资源注册与分配            │   │
│  │  • 能力匹配         │  │  • 冲突检测与解决            │   │
│  │  • 负载均衡         │  │  • 优先级调度                │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  TaskDecomposer     │  │   NegotiationManager        │   │
│  │  • 任务分解         │  │  • 协商提案创建             │   │
│  │  • 智能分配         │  │  • 冲突协商解决             │   │
│  │  • 策略匹配         │  │  • 提案响应处理             │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              IMessageBroker (消息代理)                   │   │
│  │  • InMemoryBroker: 单机多 Agent                          │   │
│  │  • KafkaBroker: 分布式部署                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 核心能力

### 1. 角色分工 (Role Assignment)

#### 预定义角色

| 角色 | 能力 | 优先级 | 适用场景 |
|------|------|--------|----------|
| **COORDINATOR** | 任务分解、资源分配、冲突解决 | 100 | 协调者，负责任务分配 |
| **DATA_AGENT** | 数据抽取、转换、加载、验证 | 80 | 数据对接和处理 |
| **ETL_AGENT** | Pipeline编排、工作流调度 | 80 | ETL任务执行 |
| **ANALYSIS_AGENT** | 数据分析、报表生成、指标计算 | 80 | 数据分析和计算 |
| **VISUALIZATION_AGENT** | 图表生成、Dashboard创建 | 70 | 数据可视化 |
| **WORKER** | 任务执行、工具调用 | 50 | 通用任务执行 |
| **OBSERVER** | 监控、日志、告警 | 30 | 监控和观察 |

#### 任务分配策略

```typescript
enum AssignmentStrategy {
  CAPABILITY_MATCH = 'capability_match',     // 按能力匹配
  LOAD_BALANCE = 'load_balance',             // 负载均衡
  PRIORITY = 'priority',                     // 按角色优先级
  COST_OPTIMIZATION = 'cost_optimization',   // 成本优化
}
```

#### 使用示例

```typescript
// 创建协调者 Agent
const coordinator = new CollaborationLayer(agentId, broker, true);
await coordinator.initialize(AgentRole.COORDINATOR, [
  'task_decomposition',
  'resource_allocation',
  'conflict_resolution'
]);

// 创建数据 Agent
const dataAgent = new CollaborationLayer(agentId2, broker);
await dataAgent.initialize(AgentRole.DATA_AGENT, [
  'data_extraction',
  'data_transformation'
]);

// 查找最佳匹配的 Agent
const bestAgent = coordinator.findBestAgent(
  ['data_extraction', 'etl_pipeline'],
  AssignmentStrategy.LOAD_BALANCE
);
```

### 2. 通信交互 (Communication)

#### 标准化消息类型

```typescript
enum MessageType {
  TASK_ASSIGN = 'task_assign',      // 任务分配
  TASK_RESULT = 'task_result',      // 任务结果
  STATUS_UPDATE = 'status_update',  // 状态更新
  ERROR_REPORT = 'error_report',    // 错误报告
  COORDINATION = 'coordination',    // 协调消息
  BROADCAST = 'broadcast',          // 广播消息
}
```

#### 通信模式

**点对点通信**
```typescript
// Agent A 向 Agent B 发送任务
await collaboration.sendMessage(
  agentB_Id,
  MessageType.TASK_ASSIGN,
  {
    taskId: 'task_001',
    description: '从MySQL抽取数据',
    deadline: Date.now() + 3600000
  }
);
```

**广播通信**
```typescript
// 广播状态更新
await collaboration.broadcastStatus('active', {
  load: 0.5,
  currentTasks: 2
});
```

### 3. 协调与协商 (Coordination & Negotiation)

#### 资源管理

```typescript
// 注册资源
resourceManager.registerResource({
  id: 'mysql_sales_db',
  type: ResourceType.DATABASE,
  name: '销售数据库',
  priority: 80
});

// 请求资源
const request = await collaboration.requestResource(
  ResourceType.DATABASE,
  {
    resourceId: 'mysql_sales_db',
    priority: 90,
    duration: 300000  // 5分钟
  }
);
```

#### 冲突检测与协商

当两个 Agent 同时请求同一资源时：

1. **冲突检测**：系统自动检测到资源冲突
2. **协商提案**：创建协商提案，提供让渡条件
3. **自动响应**：根据优先级自动响应或人工介入
4. **优先级抢占**：高优先级可强制抢占低优先级资源

```typescript
// 资源管理器自动处理冲突
resourceManager.on('resource:conflict', async ({ request, conflict }) => {
  // 尝试协商解决
  const result = await negotiationManager.negotiateConflict(
    request.agentId,
    conflict.agentId,
    request.resourceId
  );

  if (result.success) {
    console.log('冲突通过协商解决:', result.resolution);
  } else {
    // 协商失败，使用优先级抢占
    if (request.priority > conflict.priority) {
      await resourceManager.preemptResource(request.resourceId, request);
    }
  }
});
```

## 企业级场景示例

### 场景：企业数据智能平台

```
┌─────────────────────────────────────────────────────────────┐
│                    数据智能平台场景                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐                                          │
│  │   用户请求   │  "生成销售数据周报"                        │
│  └──────┬───────┘                                          │
│         ▼                                                   │
│  ┌──────────────┐     任务分解      ┌─────────────────┐    │
│  │  Coordinator │ ────────────────▶ │ 子任务列表       │    │
│  │   Agent      │                   │ 1. 数据抽取       │    │
│  └──────┬───────┘                   │ 2. 数据清洗       │    │
│         │                           │ 3. 指标计算       │    │
│         │    分配                   │ 4. 图表生成       │    │
│         ▼                           │ 5. 报告组装       │    │
│  ┌──────────────┐                   └─────────────────┘    │
│  │              │        资源请求                            │
│  │  Data Agent  │ ◀───── 销售数据库 ─────▶ 冲突检测         │
│  │              │        (协调抢占低优先级任务)              │
│  └──────┬───────┘                                          │
│         │    数据                                          │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │  ETL Agent   │  数据转换和计算                           │
│  └──────┬───────┘                                          │
│         │    结果                                          │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │ Analysis Agent│  指标分析                                │
│  └──────┬───────┘                                          │
│         │    分析结果                                      │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │  Viz Agent   │  生成图表和报告                           │
│  └──────┬───────┘                                          │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │   周报完成   │                                          │
│  └──────────────┘                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 代码实现

```typescript
// 1. 初始化多个 Agent
const coordinator = new CollaborationLayer('coordinator-1', broker, true);
await coordinator.initialize(AgentRole.COORDINATOR);

const dataAgent = new CollaborationLayer('data-1', broker);
await dataAgent.initialize(AgentRole.DATA_AGENT);

const etlAgent = new CollaborationLayer('etl-1', broker);
await etlAgent.initialize(AgentRole.ETL_AGENT);

const analysisAgent = new CollaborationLayer('analysis-1', broker);
await analysisAgent.initialize(AgentRole.ANALYSIS_AGENT);

const vizAgent = new CollaborationLayer('viz-1', broker);
await vizAgent.initialize(AgentRole.VISUALIZATION_AGENT);

// 2. 注册所有 Agent
[coordinator, dataAgent, etlAgent, analysisAgent, vizAgent].forEach(agent => {
  coordinator.registerAgent({
    id: agent.agentId,
    name: `Agent-${agent.agentId}`,
    role: agent.getRole(),
    capabilities: agent.getCapabilities(),
    description: agent.getDescription(),
    config: {}
  });
});

// 3. 注册共享资源
coordinator.getManager().getResourceManager().registerResource({
  id: 'sales_database',
  type: ResourceType.DATABASE,
  name: '销售数据库',
  priority: 80
});

// 4. 创建协作任务
const task = await coordinator.createTask(
  '生成销售数据周报',
  ['data-1', 'etl-1', 'analysis-1', 'viz-1'],
  {
    strategy: AssignmentStrategy.CAPABILITY_MATCH,
    decompose: true
  }
);

// 5. Data Agent 执行数据抽取
dataAgent.getManager().on('task:assigned', async (taskInfo) => {
  // 请求数据库资源
  const resourceReq = await dataAgent.requestResource(
    ResourceType.DATABASE,
    { resourceId: 'sales_database', priority: 80, duration: 60000 }
  );

  if (resourceReq.status === 'granted') {
    // 执行数据抽取
    const data = await extractData();
    
    // 提交结果
    await dataAgent.getManager().submitResult(
      taskInfo.taskId,
      taskInfo.subtaskId,
      data
    );
    
    // 释放资源
    dataAgent.getManager().releaseResource(resourceReq.id);
  }
});

// 6. 协调者接收结果并协调后续任务
coordinator.getManager().on('task:result', async (result) => {
  console.log(`收到来自 ${result.from} 的结果`);
  
  // 检查所有子任务是否完成
  const task = coordinator.getManager().getCollaborativeTask(result.content.taskId);
  
  if (allSubtasksCompleted(task)) {
    console.log('所有子任务完成，组装最终结果');
  }
});
```

## API 参考

### CollaborationLayer

| 方法 | 描述 |
|------|------|
| `initialize(role, capabilities)` | 初始化 Agent |
| `sendMessage(to, type, content)` | 发送消息 |
| `broadcastStatus(status, details)` | 广播状态 |
| `createTask(goal, participants, options)` | 创建协作任务 |
| `requestResource(type, options)` | 请求资源 |
| `findBestAgent(capabilities, strategy)` | 查找最佳 Agent |
| `registerAgent(agent)` | 注册 Agent |
| `setAsCoordinator(isCoordinator)` | 设置为协调者 |

### ResourceManager

| 方法 | 描述 |
|------|------|
| `registerResource(resource)` | 注册资源 |
| `requestResource(agentId, type, options)` | 请求资源 |
| `releaseResource(requestId)` | 释放资源 |
| `preemptResource(resourceId, request)` | 抢占资源 |
| `getAgentResources(agentId)` | 获取 Agent 持有的资源 |

### TaskDecomposer

| 方法 | 描述 |
|------|------|
| `decomposeTask(goal, context)` | 分解任务 |
| `assignSubtasks(subtasks, registry, strategy)` | 分配子任务 |

## 部署模式

### 单机多 Agent 模式

```typescript
const broker = new InMemoryBroker();

const agent1 = new CollaborationLayer('agent-1', broker);
const agent2 = new CollaborationLayer('agent-2', broker);
// ...
```

### 分布式模式

```typescript
const kafka = new Kafka({ brokers: ['kafka:9092'] });
const broker = new KafkaBroker(kafka);

const agent1 = new CollaborationLayer('agent-1', broker);
const agent2 = new CollaborationLayer('agent-2', broker); // 可以运行在不同机器上
// ...
```

## 最佳实践

1. **角色设计**：根据业务场景设计合适的 Agent 角色
2. **资源粒度**：资源定义要合理，避免过细导致频繁冲突
3. **超时设置**：协商和任务执行都要设置合理的超时时间
4. **错误处理**：实现完善的错误报告和恢复机制
5. **监控日志**：利用事件系统监控协作状态

## 后续扩展

- [ ] 基于区块链的 Agent 信任机制
- [ ] 动态角色学习和调整
- [ ] 跨组织 Agent 协作协议
- [ ] 可视化协作监控面板
