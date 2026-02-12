# 第三方应用集成指南

本文档介绍如何将 Amphi ETL Agent 集成到第三方对话聊天窗口中。

## 主题样式

集成示例采用了深色科技风格（Dark Neo-Future），与主流数据平台（如截图所示）保持一致：

- **背景**：深蓝紫色渐变 (#1a1d29 → #212636)
- **卡片**：深色面板 (#252a3a) + 微边框
- **强调色**：明亮蓝色渐变 (#3b82f6 → #6366f1)
- **文字**：浅灰/白色 (#e2e8f0, #94a3b8)
- **状态指示**：绿色在线 (#10b981)、橙色思考 (#f59e0b)、红色错误 (#ef4444)

### 文件列表

| 文件 | 说明 | 主题 |
|------|------|------|
| `embed-chat-dark.html` | 悬浮聊天组件（推荐） | 深色科技 |
| `test-integration-dark.html` | 集成测试工具 | 深色科技 |
| `embed-chat.html` | 悬浮聊天组件 | 浅色默认 |
| `react-chat-widget.jsx` | React 组件 | 浅色默认 |
| `vue-chat-widget.vue` | Vue 组件 | 浅色默认 |

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    第三方应用                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   前端页面   │    │  聊天组件   │    │  用户界面   │     │
│  │  (React/Vue)│    │  (Web Component)│   │  (HTML/JS) │    │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                   │            │
│         └──────────────────┼───────────────────┘            │
│                            │                                │
│         ┌──────────────────┴───────────────────┐            │
│         │         后端代理服务                  │            │
│         │  (Express/Next.js/你的后端框架)        │            │
│         └──────────────────┬───────────────────┘            │
└────────────────────────────┼────────────────────────────────┘
                             │
                             │ HTTP API
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Amphi ETL API 服务                             │
│              (http://localhost:3456)                         │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 方式一：纯 HTML/JavaScript 嵌入（最简单）

1. **启动 Amphi ETL API 服务**
```bash
cd /path/to/nodejs-agent-framework
npm run agent:etl:api
```

2. **启动代理服务（处理跨域）**
```bash
node agents/amphi-etl/examples/integration/express-proxy.js
```

3. **在第三方网页中嵌入**

直接复制 `embed-chat.html` 中的代码到你的网页，或：

```html
<!-- 在 <head> 中添加样式 -->
<link rel="stylesheet" href="https://your-cdn.com/etl-chat-widget.css">

<!-- 在 <body> 结束处添加脚本 -->
<script src="https://your-cdn.com/etl-chat-widget.js"></script>
<script>
  ETLChatWidget.init({
    apiBaseUrl: 'http://your-proxy-server:3001/api/chat',
    userId: 'user-123'
  });
</script>
```

### 方式二：React 组件集成

```bash
# 复制组件到项目
cp agents/amphi-etl/examples/integration/react-chat-widget.jsx \
   your-project/components/ETLChatWidget.jsx
```

```jsx
import ETLChatWidget from './components/ETLChatWidget';

function App() {
  return (
    <div className="app">
      <ETLChatWidget
        apiBaseUrl="/api/chat"
        userId={currentUser.id}
        title="🤖 数据处理助手"
        subtitle="告诉我你需要处理什么数据"
      />
    </div>
  );
}
```

### 方式三：Vue 组件集成

```bash
# 复制组件到项目
cp agents/amphi-etl/examples/integration/vue-chat-widget.vue \
   your-project/components/ETLChatWidget.vue
```

```vue
<template>
  <div class="app">
    <ETLChatWidget
      apiBaseUrl="/api/chat"
      :userId="currentUser.id"
      title="🤖 数据处理助手"
    />
  </div>
</template>

<script setup>
import ETLChatWidget from './components/ETLChatWidget.vue';
</script>
```

## 后端代理配置

### Express 代理（推荐）

```javascript
// proxy.js
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());

// 代理到 Amphi ETL API
app.use('/api/etl', createProxyMiddleware({
  target: 'http://localhost:3456',
  changeOrigin: true,
  pathRewrite: { '^/api/etl': '' },
}));

app.listen(3001);
```

### Next.js API Route

```typescript
// pages/api/etl/[...path].ts
import { createProxyMiddleware } from 'http-proxy-middleware';

const proxy = createProxyMiddleware({
  target: 'http://localhost:3456',
  changeOrigin: true,
  pathRewrite: { '^/api/etl': '' },
});

export default function handler(req, res) {
  return proxy(req, res);
}
```

### Nginx 反向代理

```nginx
location /api/etl/ {
    proxy_pass http://localhost:3456/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## API 接口说明

### 1. 创建会话

```http
POST /api/v1/sessions
Content-Type: application/json

{
  "userId": "user-123"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-string",
    "userId": "user-123",
    "status": "INITIAL"
  }
}
```

### 2. 发送消息

```http
POST /api/v1/chat
Content-Type: application/json

{
  "sessionId": "uuid-string",
  "message": "把CSV导入MySQL",
  "userId": "user-123"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-string",
    "response": "已为你匹配到方案...",
    "isComplete": false,
    "phase": "PROPOSING",
    "pipelineFile": null
  }
}
```

### 3. 获取会话状态

```http
GET /api/v1/sessions/{sessionId}
```

响应：
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-string",
    "phase": "CONFIRMING",
    "config": {
      "input": "CSV Input",
      "output": "MySQL Output",
      "transformations": ["Data Cleaning"]
    }
  }
}
```

## 阶段说明

| 阶段 | 说明 | 用户操作 |
|------|------|----------|
| `INITIAL` | 初始状态 | 输入数据处理需求 |
| `PROPOSING` | 已生成方案 | 确认、修改或拒绝方案 |
| `COLLECTING` | 收集参数 | 提供连接参数（主机、端口等） |
| `CONFIRMING` | 等待确认 | 确认生成 Pipeline |
| `COMPLETED` | 已完成 | Pipeline 已生成，可下载 |

## 前端状态管理

### React Hook 示例

```typescript
// hooks/useETLChat.ts
import { useState, useCallback } from 'react';

export function useETLChat(apiBaseUrl: string, userId: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('INITIAL');
  const [isLoading, setIsLoading] = useState(false);

  const createSession = useCallback(async () => {
    const res = await fetch(`${apiBaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    setSessionId(data.sessionId);
    return data.sessionId;
  }, [apiBaseUrl, userId]);

  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId) return;
    
    setIsLoading(true);
    const res = await fetch(`${apiBaseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message, userId }),
    });
    const data = await res.json();
    
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: data.data.response,
    }]);
    setPhase(data.data.phase);
    setIsLoading(false);
    
    return data.data;
  }, [sessionId, apiBaseUrl, userId]);

  return { sessionId, messages, phase, isLoading, createSession, sendMessage };
}
```

## 安全建议

### 1. API Key 管理
- 不要在客户端暴露 Amphi ETL API 的真实地址
- 通过后端代理添加认证
- 使用环境变量存储敏感信息

### 2. 用户认证
```javascript
// 在代理服务中添加认证
app.post('/api/chat/message', authenticateUser, async (req, res) => {
  // req.user 来自认证中间件
  const { sessionId, message } = req.body;
  
  const response = await fetch(`${ETL_API_BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ETL_API_KEY}`
    },
    body: JSON.stringify({
      sessionId,
      message,
      userId: req.user.id, // 使用已认证用户的 ID
    }),
  });
  
  // ...
});
```

### 3. 会话隔离
- 确保用户只能访问自己的会话
- 验证 sessionId 是否属于当前用户

```javascript
// 会话验证中间件
async function validateSession(req, res, next) {
  const { sessionId } = req.body;
  const session = await getSessionFromDB(sessionId);
  
  if (session.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  next();
}
```

## 完整示例

### 场景：在数据平台中嵌入 ETL 助手

```jsx
// DataPlatform.jsx
import React, { useState } from 'react';
import { Drawer, Button, Badge } from 'antd'; // 或其他 UI 库
import ETLChatWidget from './ETLChatWidget';

export default function DataPlatform() {
  const [chatVisible, setChatVisible] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  return (
    <div className="data-platform">
      {/* 平台主要内容 */}
      <main>
        <h1>数据管理平台</h1>
        {/* ... */}
      </main>

      {/* 悬浮聊天按钮 */}
      <Badge dot={hasNewMessage}>
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<MessageOutlined />}
          onClick={() => {
            setChatVisible(true);
            setHasNewMessage(false);
          }}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
          }}
        />
      </Badge>

      {/* 聊天抽屉 */}
      <Drawer
        title="🤖 ETL 智能助手"
        placement="right"
        width={500}
        onClose={() => setChatVisible(false)}
        open={chatVisible}
      >
        <ETLChatWidget
          apiBaseUrl="/api/chat"
          userId={currentUser.id}
          onNewMessage={() => setHasNewMessage(true)}
          onPipelineGenerated={(file) => {
            // Pipeline 生成后的回调
            message.success('Pipeline 已生成！');
            // 可以在这里刷新数据列表等
          }}
        />
      </Drawer>
    </div>
  );
}
```

## 故障排查

### 常见问题

1. **跨域错误 (CORS)**
   - 确保使用了后端代理
   - 检查代理服务的 CORS 配置

2. **连接失败**
   - 确认 Amphi ETL API 服务已启动
   - 检查代理服务配置的地址是否正确

3. **会话丢失**
   - 检查 sessionId 是否正确保存
   - 确认前端状态管理没有问题

4. **消息不显示**
   - 检查浏览器控制台是否有错误
   - 确认 API 响应格式是否正确

## 更多资源

- [Amphi ETL Agent 文档](../../README.md)
- [API 详细文档](../../api/server.ts)
- [SDK 使用指南](../../sdk/index.ts)
