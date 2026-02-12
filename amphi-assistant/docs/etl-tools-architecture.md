# ETL Agent 工具调用架构

## 概述

ETL Agent 现已集成执行层（Execution Layer）的工具调用能力，支持大模型根据上下文自主决定调用工具，实现更智能的组件推荐、参数验证和 Pipeline 生成。

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        SmartETLAgent                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  执行层 (ExecutionLayer)                 │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              注册的工具 (8个)                    │   │   │
│  │  │  • query_ontology        - 本体查询              │   │   │
│  │  │  • search_components     - 组件搜索              │   │   │
│  │  │  • validate_params       - 参数验证              │   │   │
│  │  │  • check_connection      - 连接检查              │   │   │
│  │  │  • generate_pipeline     - Pipeline生成          │   │   │
│  │  │  • recommend_transforms  - 转换推荐              │   │   │
│  │  │  • analyze_lineage       - 血缘分析              │   │   │
│  │  │  • get_component_detail  - 组件详情              │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  大模型工具调用                          │   │
│  │  understandIntentWithTools()    - 意图理解+工具调用     │   │
│  │  searchComponentsWithTools()    - 组件搜索             │   │
│  │  validateParamsWithTools()      - 参数验证             │   │
│  │  generatePipelineWithTools()    - Pipeline生成         │   │
│  │  processWithTools()             - 主入口               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ETLToolFactory                              │
│              创建工具实例，绑定到知识图谱和记忆层                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 工具列表

### 1. query_ontology - 本体查询
```typescript
// 查询知识图谱中的本体信息
{
  queryType: 'component' | 'relationship' | 'lineage' | 'schema',
  conceptName?: string,
  conceptType?: string,
  componentId?: string,
  limit?: number
}
```

### 2. search_components - 组件搜索
```typescript
// 根据关键词搜索 ETL 组件
{
  keyword: string,
  category?: 'input' | 'output' | 'transform',
  limit?: number
}
```

### 3. validate_params - 参数验证
```typescript
// 验证组件参数配置
{
  componentId: string,
  parameters: Record<string, any>
}
// 返回: { valid, errors, warnings, validated }
```

### 4. check_connection - 连接检查
```typescript
// 检查数据源连接
{
  connectionType: 'database' | 'file' | 'api',
  connectionConfig: Record<string, any>
}
```

### 5. generate_pipeline - Pipeline 生成
```typescript
// 生成 SeaTunnel Pipeline 配置
{
  input?: { id: string, params: object },
  output?: { id: string, params: object },
  transformations: Array<{ id: string, params: object }>
}
```

### 6. recommend_transforms - 转换推荐
```typescript
// 根据源/目标类型推荐转换
{
  sourceType: string,
  targetType: string,
  sourceSchema?: Record<string, string>,
  targetSchema?: Record<string, string>
}
```

### 7. analyze_lineage - 血缘分析
```typescript
// 分析数据字段血缘关系
{
  fieldId: string,
  depth?: number
}
```

### 8. get_component_detail - 组件详情
```typescript
// 获取组件完整信息
{
  componentId: string
}
```

---

## 工具调用流程

```
用户输入
    │
    ▼
┌─────────────────────┐
│  understandIntent   │  大模型分析意图
│    WithTools()      │  + 决定调用哪些工具
└─────────────────────┘
    │
    ├───► 调用工具 1 (如 search_components)
    │           │
    │           ▼
    │     执行工具处理器
    │           │
    │           ▼
    │     获取结果
    │           │
    ◄───────────┘
    │
    ├───► 调用工具 2 (如 validate_params)
    │           │
    │          ...
    │
    ▼
大模型综合工具结果
生成最终回复
```

---

## 使用示例

### 示例 1: 基础使用（自动工具调用）

```typescript
const agent = new SmartETLAgent(llm, kg, pgRepo);
await agent.initialize(); // 会自动注册工具

// 用户输入
const result = await agent.processWithTools(
  '我需要从 MySQL 同步数据到 PostgreSQL'
);

// 输出包含工具调用记录
console.log(result.response);
console.log(result.toolCalls); // 显示调用了哪些工具
```

### 示例 2: 显式调用特定工具

```typescript
// 搜索组件
const { components } = await agent.searchComponentsWithTools(
  'mysql', 
  'input'
);

// 验证参数
const validation = await agent.validateParamsWithTools(
  'mysql-input',
  { host: 'localhost', port: 3306 }
);

if (!validation.valid) {
  console.log('参数错误:', validation.errors);
}

// 生成 Pipeline
const { pipeline, filepath } = await agent.generatePipelineWithTools();
```

### 示例 3: 在 process 方法中使用工具

```typescript
// 主处理流程已集成工具调用
async process(userInput: string) {
  // 使用工具增强版处理
  const result = await this.processWithTools(userInput);
  
  return {
    response: result.response,
    isComplete: result.isComplete,
    pipelineFile: result.pipelineFile,
    toolCalls: result.toolCalls // 返回工具调用记录
  };
}
```

---

## 大模型工具决策提示词

当用户输入到达时，大模型会收到如下提示词：

```
你是一个智能ETL助手。根据用户的输入，决定是否需要调用工具来获取更多信息。

用户输入: "..."

当前会话状态:
- 阶段: ...
- 已选输入: ...
- 已选输出: ...
- 已选转换: ...

可用工具:
[
  {
    "name": "search_components",
    "description": "根据关键词搜索 ETL 组件...",
    "parameters": {...}
  },
  ...
]

请分析：
1. 用户的意图是什么？
2. 是否需要调用工具来获取更多信息？
3. 工具参数应该是什么？

请以JSON格式回复:
{
  "intent": { ... },
  "toolCalls": [
    { "tool": "...", "params": {...}, "reason": "..." }
  ]
}
```

---

## 工具实现结构

### 工具定义 (ETLToolFactory)

```typescript
class ETLToolFactory {
  createQueryOntologyTool(): Tool {
    return {
      name: 'query_ontology',
      description: '...',
      parameters: { ... },
      handler: async (params, context) => {
        // 实现逻辑
        return { success: true, data: ... };
      }
    };
  }
}
```

### 工具注册

```typescript
private initToolFactory(ontologyLayer: OntologyLayer): void {
  this.toolFactory = new ETLToolFactory(kg, ontologyLayer, memoryLayer);
  
  // 创建并注册所有工具
  const tools = this.toolFactory.createTools();
  for (const tool of tools) {
    this.executionLayer.registerTool(tool);
  }
}
```

### 执行上下文

```typescript
const context: ExecutionContext = {
  taskId: uuidv4(),
  agentId: this.sessionId,
  sessionId: this.sessionId,
  planId: uuidv4(),
  memory: {
    shortTerm: new Map(),
    get: async (key) => this.workingMemory?.tempResults.get(key),
    set: async (key, value) => {
      if (this.workingMemory) {
        this.workingMemory.tempResults.set(key, value);
      }
    },
  },
  logger: console,
};
```

---

## 优势

### 1. 增强理解能力
- 大模型可以主动查询知识图谱获取组件信息
- 不再依赖固定的匹配逻辑

### 2. 实时参数验证
- 用户输入参数后立即验证
- 提供即时反馈，减少错误

### 3. 智能组件推荐
- 基于源/目标类型推荐转换组件
- 结合历史经验优化推荐

### 4. 可扩展性
- 轻松添加新工具
- 工具与业务逻辑解耦

---

## 文件结构

```
agents/
├── etl-agent.ts          # ETL Agent 主类（含工具调用方法）
├── etl-tools.ts          # 工具定义和实现
└── output/               # Pipeline 输出目录

examples/
└── etl-agent-with-tools.ts  # 工具调用示例

docs/
└── etl-tools-architecture.md  # 本文档
```

---

## 后续扩展建议

1. **更多工具类型**
   - `preview_data`: 数据预览
   - `analyze_schema`: Schema 分析
   - `estimate_cost`: 成本估算

2. **工具链编排**
   - 支持工具之间的依赖关系
   - 条件工具调用（如果 A 失败则调用 B）

3. **工具结果缓存**
   - 缓存常用查询结果
   - 减少重复调用开销

4. **人机协作工具**
   - `ask_user`: 向用户询问信息
   - `confirm_action`: 确认敏感操作
