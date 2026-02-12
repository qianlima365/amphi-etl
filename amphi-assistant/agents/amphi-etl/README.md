# Amphi ETL Agent

智能ETL编排 Agent，基于自然语义理解，像你与开发者协作一样工作。

## 架构设计

```
amphi-etl/
├── src/
│   ├── core/           # 核心 Agent 类
│   ├── services/       # 业务服务层
│   ├── layers/         # 框架层适配器
│   ├── tools/          # 工具工厂
│   ├── types/          # 类型定义
│   └── utils/          # 工具函数
├── cli/                # CLI 入口
├── api/                # HTTP API 服务
├── sdk/                # JavaScript SDK
└── index.ts            # 统一导出
```

## 使用方式

### 方式一：CLI 模式

```bash
# 启动交互式命令行
npm run agent:etl:cli

# 或直接运行
ts-node agents/amphi-etl/cli/index.ts
```

### 方式二：HTTP API 模式

```bash
# 启动 API 服务
npm run agent:etl:api

# 或使用 ts-node
ts-node agents/amphi-etl/api/server.ts
```

API 端点：
- `POST /api/v1/sessions` - 创建会话
- `POST /api/v1/chat` - 发送消息
- `GET /api/v1/sessions/:id` - 获取会话状态
- `DELETE /api/v1/sessions/:id` - 删除会话
- `GET /health` - 健康检查
- `WS /ws` - WebSocket 实时通信

### 方式三：SDK 集成

```typescript
import { AmphiETLClient } from './agents/amphi-etl';

// 创建客户端
const client = new AmphiETLClient({
  apiBaseUrl: 'http://localhost:3456',
  userId: 'my-user'
});

// 创建会话
const session = await client.createSession();

// 对话
const response1 = await session.chat('把CSV文件导入MySQL');
console.log(response1.response);

// 提供参数
const response2 = await session.chat('主机 localhost，端口 3306');
console.log(response2.response);

// 确认生成
const response3 = await session.chat('确认');
console.log(response3.pipelineFile);  // 生成的文件路径
```

### 方式四：直接使用 Agent 类

```typescript
import { AmphiETLAgent } from './agents/amphi-etl';
import { OpenAILLMService, Neo4jKnowledgeGraph } from './src';
import { createPostgresRepositoryFromEnv } from './src/repositories/dialogue';

// 初始化服务
const llm = new OpenAILLMService({
  apiKey: process.env.SILICONFLOW_API_KEY!,
  model: 'deepseek-ai/DeepSeek-V2.5',
  baseURL: 'https://api.siliconflow.cn/v1',
});

const kg = new Neo4jKnowledgeGraph({
  uri: process.env.NEO4J_URI!,
  username: process.env.NEO4J_USER || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password',
});

const repository = createPostgresRepositoryFromEnv();

// 创建 Agent
const agent = new AmphiETLAgent({
  llm,
  kg,
  repository,
  userId: 'user-123',
});

// 初始化
await agent.initialize();

// 处理消息
const result = await agent.process('把CSV导入MySQL');
console.log(result.response);

// 获取状态
console.log(agent.getPhase());  // 当前对话阶段
console.log(agent.getConfig()); // 当前配置
```

## 环境变量

```env
# LLM 配置（必需）
SILICONFLOW_API_KEY=your_api_key
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V2.5
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# Neo4j 配置（必需）
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# PostgreSQL 配置（必需）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=etl_agent
DB_USER=postgres
DB_PASSWORD=password

# API 服务端口（可选）
ETL_API_PORT=3456

# 用户标识（可选）
USER_ID=anonymous
```

## 核心功能

### 1. 意图理解
- 快速规则判断（减少 LLM 调用）
- LLM 深度意图分析
- 环境状态感知（双路采集）

### 2. 组件管理
- 从 Neo4j 知识图谱加载组件
- 关键词搜索和排序
- LLM 智能匹配

### 3. 参数处理
- 自动填充默认值
- 从历史对话提取参数
- 学习用户偏好

### 4. 记忆层
- 工作记忆（短期）
- 经验记忆（长期）
- 知识记忆（本体论同步）

### 5. Pipeline 生成
- 生成 Amphi Pipeline JSON
- 保存为 .ampln 文件
- 支持中间转换组件

## 扩展开发

### 添加自定义工具

```typescript
import { ExecutionAdapter } from './agents/amphi-etl';

const execution = new ExecutionAdapter();
execution.getExecutionLayer().registerTool({
  name: 'my_custom_tool',
  description: '我的自定义工具',
  parameters: { type: 'object', properties: {} },
  handler: async (params, context) => {
    return { success: true, data: {} };
  }
});
```

### 自定义输出处理器

```typescript
import { OutputHandler } from './agents/amphi-etl';

class MyOutputHandler implements OutputHandler {
  start(label?: string): void {}
  write(chunk: string): void {}
  end(): void {}
  info(message: string): void {}
  warn(message: string): void {}
  error(message: string): void {}
}

const agent = new AmphiETLAgent({
  llm, kg, repository,
  output: new MyOutputHandler()
});
```

## 许可证

MIT
