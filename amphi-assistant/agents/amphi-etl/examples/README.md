# Amphi ETL Agent 集成示例

本目录包含将 ETL Agent 集成到第三方应用的完整示例。

## 文件说明

```
examples/
├── integration/              # 集成示例
│   ├── README.md            # 详细集成指南
│   ├── embed-chat.html      # 纯 HTML 嵌入示例（最简单）
│   ├── react-chat-widget.jsx # React 组件
│   ├── vue-chat-widget.vue   # Vue 组件
│   ├── express-proxy.js      # Express 代理服务
│   ├── nextjs-api-route.ts   # Next.js API 路由
│   └── test-integration.html # 集成测试工具
```

## 快速集成（3 分钟搞定）

### 步骤 1: 启动 ETL Agent API

```bash
# 在项目根目录
npm run agent:etl:api
# 服务将启动在 http://localhost:3456
```

### 步骤 2: 启动代理服务（解决跨域）

```bash
# 使用 Express 代理
cd agents/amphi-etl/examples/integration
node express-proxy.js
# 代理服务将启动在 http://localhost:3001
```

### 步骤 3: 嵌入到第三方网页

复制以下代码到你的网页：

```html
<!-- 聊天窗口容器 -->
<div id="etl-chat-widget"></div>

<!-- 脚本 -->
<script>
(function() {
  const API_URL = 'http://localhost:3001/api/chat';
  let sessionId = null;

  // 创建 UI
  const widget = document.getElementById('etl-chat-widget');
  widget.innerHTML = `
    <div style="border:1px solid #ddd;padding:20px;border-radius:8px;width:400px;">
      <h3>🤖 ETL 助手</h3>
      <div id="messages" style="height:300px;overflow-y:auto;border:1px solid #eee;padding:10px;margin:10px 0;"></div>
      <input id="msgInput" type="text" placeholder="输入需求..." style="width:70%;padding:8px;">
      <button onclick="send()" style="padding:8px 16px;">发送</button>
    </div>
  `;

  // 创建会话
  fetch(`${API_URL}/session`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userId: 'web-user'})
  })
  .then(r => r.json())
  .then(d => { sessionId = d.sessionId; addMsg('bot', '你好！请描述数据处理需求'); });

  // 发送消息
  window.send = function() {
    const input = document.getElementById('msgInput');
    const msg = input.value.trim();
    if (!msg) return;
    
    addMsg('user', msg);
    input.value = '';
    
    fetch(`${API_URL}/message`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sessionId, message: msg, userId: 'web-user'})
    })
    .then(r => r.json())
    .then(d => addMsg('bot', d.data.response));
  };

  function addMsg(role, text) {
    const div = document.getElementById('messages');
    div.innerHTML += `<div style="margin:8px 0;padding:8px;background:${role==='user'?'#007bff':'#f1f1f1'};color:${role==='user'?'white':'black'};border-radius:4px;">${text}</div>`;
    div.scrollTop = div.scrollHeight;
  }
})();
</script>
```

## 集成方式对比

| 方式 | 难度 | 适用场景 | 特点 |
|------|------|----------|------|
| **HTML 嵌入** | ⭐ 最简单 | 任何网站 | 复制粘贴即可使用 |
| **React 组件** | ⭐⭐ 简单 | React 项目 | 现代化、可定制 |
| **Vue 组件** | ⭐⭐ 简单 | Vue 项目 | 响应式、可定制 |
| **直接 API** | ⭐⭐⭐ 中等 | 自定义开发 | 完全控制 |

## 测试工具

打开 `test-integration.html` 进行集成测试：

```bash
# 在浏览器中打开测试工具
open agents/amphi-etl/examples/integration/test-integration.html
```

测试内容包括：
- ✅ API 连接测试
- ✅ 创建会话测试
- ✅ 消息发送测试
- ✅ 完整流程测试

## 典型集成场景

### 场景 1: 数据平台集成
在数据管理平台的右下角添加悬浮聊天按钮，用户可以随时询问数据处理需求。

### 场景 2: 低代码平台集成
将 ETL 助手嵌入到低代码平台的工具栏，帮助用户快速生成数据管道。

### 场景 3: 企业 OA 系统集成
在 OA 系统中嵌入，方便业务人员自助处理数据需求，减少 IT 部门负担。

### 场景 4: 客服系统集成
将 ETL 助手作为客服系统的辅助工具，快速响应用户的数据处理咨询。

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/sessions` | POST | 创建会话 |
| `/api/v1/chat` | POST | 发送消息 |
| `/api/v1/sessions/:id` | GET | 获取会话状态 |
| `/ws` | WebSocket | 实时通信 |

## 支持的前端框架

- ✅ React / Next.js
- ✅ Vue / Nuxt.js
- ✅ Angular
- ✅ 原生 JavaScript
- ✅ 小程序（需适配）

## 安全建议

1. **永远不要在前端暴露 API Key**
   ```javascript
   // ❌ 错误
   const API_KEY = 'sk-xxx'; // 不要这样做！
   
   // ✅ 正确
   // 通过后端代理转发请求
   ```

2. **使用 HTTPS**
   ```javascript
   // ❌ 错误
   const API_URL = 'http://api.example.com';
   
   // ✅ 正确
   const API_URL = 'https://api.example.com';
   ```

3. **验证用户身份**
   ```javascript
   // 在代理服务中验证
   app.post('/api/chat/message', authenticateUser, async (req, res) => {
     // req.user.id 来自认证中间件
   });
   ```

## 获取帮助

- 📖 [详细集成指南](./integration/README.md)
- 🔧 [测试工具](./integration/test-integration.html)
- 💬 [查看 SDK 文档](../sdk/index.ts)
- 🚀 [查看 API 代码](../api/server.ts)

## 下一步

1. 使用 [测试工具](./integration/test-integration.html) 验证 API 连接
2. 根据你的技术栈选择对应的组件（React/Vue/HTML）
3. 参考 [详细集成指南](./integration/README.md) 进行定制开发
