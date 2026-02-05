## 设计并实现一套完整的AI助手功能模块，具体需求如下：

1. 全局悬浮AI助手图标  
   - 在所有页面顶部或右下角固定一个可拖拽的圆形/椭圆形图标（建议尺寸48×48 px，支持深色/浅色模式自适应）。  
   - 图标需包含未读消息红点提示、loading动画、hover tooltip“AI助手”三种状态。  
   - 点击后弹出居中模态对话框，宽度≥640 px，高度≥80 % viewport，支持键盘Esc关闭与点击遮罩关闭。

2. 对话窗口核心交互  
   - 左侧对话区：  
     – 支持多轮连续对话，保留上下文（最少10轮，可滚动加载历史）。  
     – 用户输入框支持Shift+Enter换行、Ctrl+Enter发送、@唤起快捷指令、拖拽上传txt/md/json三种附件。  
     – 机器人回复区支持代码块高亮、JSON折叠、Diff预览、一键复制。  
   - 右侧配置区：  
     – 下拉选择大模型（至少预留GPT-4、Claude、自研模型三种通道，可配置base_url与api_key）。  
     – 温度、top_p、max_tokens参数滑块，实时显示数值。  
     – “系统提示词”输入框，默认内置pipeline构建专用模板（见第3点）。  

3. 提示词优化与模板化  
   - 内置pipeline构建标准模板：  
     – 模板版本号、作者、创建时间、适用场景、必填/选填参数、输出schema定义。  
     – 模板占位符使用双大括号{{variable}}，支持枚举、正则校验、默认值。  
   - 优化流程：  
     – 用户原始输入→一键“优化提示词”→调用第三方提示词优化服务（HTTP POST，超时≤8 s）→返回优化后内容并高亮diff→用户可二次编辑→确认后回填到系统提示词。  
   - 优化服务异常降级：若第三方返回非200或>8 s，则使用本地轻量级规则引擎进行同义词替换与格式补全，并给出“本地优化”标签。

4. Pipeline自动生成与.ampln文件产出  
   - 对话确认用户需求后，点击“生成Pipeline”按钮：  
     – 前端将合并后的系统提示词+用户补充描述作为payload，调用大模型生成符合.ampln schema的JSON。  
     – 生成过程展示进度条与步骤说明（解析需求→匹配模板→填充参数→生成DAG→校验环路→输出JSON）。  
     – 若生成失败，返回可读错误信息并定位到具体节点。  
   - 生成的.ampln文件预览：  
     – 提供树形结构与原始JSON两种视图，支持折叠/搜索/节点高亮。  
     – 关键字段（name、version、nodes、edges、variables）缺失时标红，并给出修复建议。  

5. 文件保存与渲染策略  
   - 保存前确认：  
     – 弹出“保存到工作空间”对话框，显示文件名（默认project_YYYYMMDD_HHmmss.ampln）、保存路径（默认./pipelines/，可手动修改）、覆盖提醒。  
     – 用户可勾选“立即渲染”选项；若取消勾选，则仅保存不渲染。  
   - 渲染失败兜底：  
     – 若后端渲染服务返回4xx/5xx或超时>15 s，前端在对话框底部显示“渲染失败”红色提示与“重试渲染”按钮。  
     – 点击“重试渲染”将重新调用渲染接口；若连续3次失败，则提供下载.ampln文件与错误日志链接，引导用户本地调试。  

6. 权限与数据安全  
   - 所有大模型调用使用HTTPS，敏感参数（api_key）仅保存在用户本地indexedDB，不上传至服务端。  
   - 第三方提示词优化服务调用时，需先弹出隐私声明，用户同意后方可发送脱敏后的提示词内容。  

7. 测试与验收标准  
   - 功能测试：覆盖图标出现/隐藏、对话框打开/关闭、多轮对话、附件上传、模板选择、提示词优化、生成成功/失败、保存/渲染、重试渲染共9条主流程。  
   - 性能测试：首次加载对话框≤800 ms；生成.ampln≤10 s（节点≤50）；保存+渲染≤5 s。  
   - 兼容性测试：Chrome、Edge、Firefox、Safari最新两版；窗口宽度≥375 px；键盘无障碍可达。  

8. 交付物  
   - 前端：React组件（AIAssistantIcon、AIChatModal、PipelinePreview、SaveConfirmDialog）+ TypeScript类型定义+.ampln schema文件。  
   - 后端：Nodejs服务（/optimizePrompt、/generatePipeline、/renderPipeline）+ Swagger接口文档。  
   - 文档：用户操作手册、模板开发指南、部署与配置说明。
          
          
## 完整的设计方案
---

**一、总体架构概览**

- **前端（JupyterLab / React）**
  - 全局悬浮按钮：`AIAssistantIcon`（全局挂在 `document.body`）
  - 对话窗体：`AIChatModal`
  - Pipeline 预览：`PipelinePreview`
  - 保存确认弹窗：`SaveConfirmDialog`
- **后端（Node.js 微服务）**
  - `/optimizePrompt`：提示词优化
  - `/generatePipeline`：根据 Prompt 生成 `.ampln` JSON
  - `/renderPipeline`：将 `.ampln` 渲染/导入到现有 ETL 系统
- **配置与安全**
  - 模型配置（base_url、api_key、参数）仅存本地（IndexedDB/localStorage 封装）
  - 后端只接收脱敏后的 prompt 与元数据，不存用户密钥

---

## 1. 全局悬浮 AI 助手图标

**1.1 组件职责**

- 组件：`AIAssistantIcon`
- 挂载方式：在 pipeline-editor 插件激活时调用 `mountAIAssistant()`，在 `document.body` 追加一个 root，单独渲染（避免受 JupyterLab DOM 结构限制）
- 功能：
  - 固定在右下角（初始坐标），可拖拽
  - 深浅色自适应：使用 JupyterLab CSS 变量（如 `--jp-layout-color2`）
  - 未读消息 `Badge` + loading `Spin` + hover `Tooltip("AI助手")`

**1.2 交互行为**

- 鼠标按下开始拖拽，mousemove 更新位置，mouseup 结束拖拽；位置限定在视口内（边界裁剪）
- 点击图标：
  - 打开 `AIChatModal` 模态窗
  - 将未读消息数清零
- ESC & mask 点击：
  - 交给 Antd `Modal` 的 `onCancel`，支持 ESC 和点击遮罩关闭

---

## 2. 对话窗口核心交互

### 2.1 左侧对话区

- 组件：`AIChatModal` 内部 `Content` 区
- 状态：
  - `messages: ChatMessage[]`，结构 `{ id, role, content, ts }`
  - 每次追加后只保留最近 10 条（满足“至少10轮”）并滚动到底部（`ref.scrollTop = scrollHeight`）
- 输入框：
  - 用 `TextArea`
  - `Shift+Enter` 换行（默认行为）
  - `Ctrl+Enter` 发送（`onKeyDown` 判断 `e.ctrlKey && e.key === 'Enter'`）
  - 预留 `@` 快捷指令：在 `onKeyDown` 或 `onChange` 中捕捉 `@`，弹出指令下拉（后续可加）
- 附件拖拽上传：
  - 使用 `Upload` 组件，`accept=".txt,.md,.json"`，`beforeUpload` 返回 `false`，本地读取内容并追加到 Prompt 或单独展示
  - 拖拽到上传区域即可添加附件（如将内容合并到用户输入框上方）

- 机器人回复区：
  - 简化版：先用 `<pre>` 渲染，后可替换为支持：
    - 代码块高亮：用 `react-syntax-highlighter` 或复用现有 CodeMirror 高亮
    - JSON 折叠：对 `content` 检测是否为 JSON，提供“展开/折叠”视图
    - Diff 预览：对“原始提示词 vs 优化后提示词”使用简单行级 diff 算法，展示高亮
    - 一键复制：在每条 assistant 消息旁放 Copy 按钮，使用 `navigator.clipboard.writeText`

### 2.2 右侧配置区

- 底层组件：`Tabs` + `Select` + `Slider` + `Input.Password` + `TextArea`
- 状态：`ModelConfig`：
  ```ts
  interface ModelConfig {
    provider: 'gpt-4' | 'claude' | 'custom';
    baseUrl: string;
    apiKey?: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    systemPrompt: string;
  }
  ```
- 模型选择：
  - `Select`，三种选项：GPT-4 通道 / Claude 通道 / 自研模型
  - 用户可配置 `baseUrl`、`apiKey`（显示“仅本地保存”提示）
- 参数调节：
  - 温度、top_p、max_tokens 用 `Slider` 控制，旁边显示当前数值
- 系统提示词：
  - 使用一个 `TextArea` 显示模板（见第3点）
  - 下面有：
    - “优化提示词”按钮
    - “生成Pipeline”按钮（调用与普通发送不同的事件）

---

## 3. 提示词优化与模板化

### 3.1 内置 pipeline 构建标准模板

- 在前端内置字符串模板（已在 `defaultPromptTemplate` 中实现）包含：
  - 版本号、作者、场景描述
  - 参数列表 + 必填/选填说明
  - 输出 schema（`.ampln` 中关键字段：`name, version, nodes, edges, variables`）

- 模板占位符规范：
  - `{{project_name}}`、`{{description}}` 等
  - 未来可在右侧配置区增加“模板变量”配置面板，对占位符做：
    - 枚举配置：`allowed_values: [...]`
    - 正则校验：`pattern: "^[A-Za-z0-9_-]{3,32}$"`
    - 默认值：`default: "default_project"`

### 3.2 提示词优化流程

- 前端流程：
  1. 用户编辑系统提示词或提供原始指令
  2. 点击“优化提示词”按钮
  3. 弹出隐私声明 `confirm`：说明将发送“脱敏后的提示词”到第三方服务，用户同意才发送
  4. 调用 `/ai/optimizePrompt`（POST，JSON：`{prompt: string}`），设置 8 秒超时（`AbortController` + `setTimeout`）
  5. 成功：返回 `optimizedPrompt`，在 UI 中可后续增加 diff 高亮（当前实现直接替换系统提示词）
  6. 用户可进一步手工修改，最终写回 `modelConfig.systemPrompt`

- 降级策略：
  - 请求超时或非 200：执行本地轻量规则优化，例如：
    - 标点规范化
    - 统一条目前缀“要求：”“参数：”等
    - 简单同义词替换
  - UI 上可以在提示词顶部显示一个小标签 `本地优化` / `服务优化`

- 后端 `/optimizePrompt`：
  - 输入：`{ prompt: string }`
  - 输出：`{ optimizedPrompt: string, meta: {...} }`
  - 可按需接入外部 LLM 或内部规则库

---

## 4. Pipeline 自动生成与 `.ampln` 文件产出

### 4.1 生成调用流程

- 触发方式：
  - 在右侧“系统提示词”Tab 中点击“生成Pipeline”
  - 或在对话区“发送”时，区分普通聊天/生成Pipeline 模式
- 前端 payload：
  ```json
  {
    "systemPrompt": "...",     // 模板 + 用户调整
    "userPrompt": "...",       // 用户补充描述
    "model": {
      "provider": "gpt-4|claude|custom",
      "baseUrl": "...",
      "temperature": 0.4,
      "topP": 0.9,
      "maxTokens": 2048
    }
  }
  ```
- 后端 `/generatePipeline`：
  - 负责调用所选模型（按 provider、baseUrl、apiKey 路由）
  - 将 LLM 输出解析为 `.ampln` JSON，做 schema 校验后返回
  - 如校验失败，返回错误结构：
    ```json
    {
      "error": true,
      "message": "nodes 缺失",
      "nodeId": "xxx",
      "path": "$.nodes"
    }
    ```

### 4.2 进度条与步骤说明

- 前端在生成过程中展示步骤（静态 + 动态）：
  1. 解析需求
  2. 匹配模板
  3. 填充参数
  4. 生成 DAG
  5. 校验环路
  6. 输出 JSON
- 用 `Steps` 或自定义步进 UI，同时在右上角显示进度条（0–100%）

### 4.3 `.ampln` 预览

- 组件：`PipelinePreview`
  - 左侧：树形结构（`Tree`）按照 `nodes` / `edges` / `variables` 分组，可折叠、搜索
  - 右侧：原始 JSON 视图（只读，支持复制）
  - 校验结果：
    - 对缺失字段 `name, version, nodes, edges, variables` 标红提示
    - 提供修复建议，如“请补充 version 字段（如 1.0.0）”

---

## 5. 文件保存与渲染策略

### 5.1 保存前确认

- 组件：`SaveConfirmDialog`
- 行为：
  - 自动生成默认文件名：`project_YYYYMMDD_HHmmss.ampln`
  - 默认保存路径：`./pipelines/`（可用 JupyterLab 文件系统 API 选择目录）
  - 复选框“立即渲染”：
    - 勾选：保存成功后立刻调用 `/renderPipeline`
    - 不勾选：只写入 `.ampln` 文件

### 5.2 渲染失败兜底

- 后端 `/renderPipeline`：
  - 负责将 `.ampln` 导入/渲染为实际 Pipeline；可能依赖现有 CodeGenerator/PipelineService
- 前端处理：
  - 超时 >15s 或 4xx/5xx：
    - 在对话窗或保存对话框底部显示红色“渲染失败”消息
    - 提供“重试渲染”按钮 → 重新调用 `/renderPipeline`
  - 失败超过 3 次：
    - 提供 `.ampln` 文件下载链接（直接从内存 blob 或从文件系统路径下载）
    - 提供错误日志下载链接（后端返回日志路径或内容）
    - 提示用户“请在本地或后端日志中进一步排查”

---

## 6. 权限与数据安全

- 模型调用：
  - 强制使用 HTTPS 的 base_url（前端可显示警告：非 https 不允许调用）
  - API Key：
    - 只存储在浏览器端（推荐封装一层 `ModelConfigStorage` 使用 IndexedDB/localStorage）
    - 不随请求发给自建 Node 服务（Node 只收到脱敏后的 prompt & 元数据，真正的模型调用可以在浏览器端发起，或 Node 端使用服务器端 Key ——两种模式需设计清楚）
- 提示词优化服务：
  - 调用前弹出隐私声明（已在前端 `window.confirm` 逻辑中加了基础确认）
  - 建议再单独做一个带 Checkbox 的同意窗（记住用户选择），确保符合 GDPR/CCPA 等要求
- 数据脱敏：
  - 在发送给第三方 LLM/优化服务前，可按配置对敏感字段做遮蔽，如替换 ID/手机号/订单号为占位符

---

## 7. 测试与验收标准

**7.1 功能测试（至少覆盖）**

1. 悬浮图标出现/隐藏（随 JupyterLab 页面加载，支持拖拽）
2. 对话框打开/关闭（点击图标、ESC、点击遮罩）
3. 多轮对话（>10轮保留最近）与上下文保留
4. 附件上传（txt/md/json）并正确合并到上下文或提示区
5. 模型通道选择（GPT-4/Claude/自研）与参数调整
6. 提示词优化（第三方成功、本地降级两种路径）
7. Pipeline 生成成功与失败（解析错误定位到节点）
8. 保存 `.ampln` 与是否渲染两种选择
9. 渲染失败后的重试与多次失败下的下载兜底

**7.2 性能测试**

- 首次加载对话框 ≤ 800 ms：
  - 提前懒加载 `AIChatModal`，只在首次点击图标时加载模块
- 生成 `.ampln` ≤ 10 s（节点 ≤ 50）：
  - 控制后端 LLM 的上下文大小与调用超时
- 保存 + 渲染 ≤ 5 s：
  - 通过本地文件系统 API + 轻量渲染路径实现；异步渲染时先反馈“已提交渲染任务”

**7.3 兼容性测试**

- 浏览器：Chrome / Edge / Firefox / Safari 最新两版
- 视口宽度 ≥ 375 px：对话框在窄屏时自动调整布局（右侧配置区可折叠）
- 无障碍：
  - 所有可交互元素有清晰焦点
  - 键盘 Tab/Shift+Tab 可遍历主要控件
  - ESC 关闭、Enter 激活按钮行为一致

---

## 8. 交付物清单

- **前端**
  - React 组件：
    - `AIAssistantIcon`（悬浮入口）
    - `AIChatModal`（对话 + 模型配置）
    - `PipelinePreview`（树形 + JSON 预览，标红缺失字段）
    - `SaveConfirmDialog`（保存/渲染控制）
  - TypeScript 类型：
    - `ModelConfig`、`ChatMessage`、`.ampln` 类型定义（或 JSON Schema 对应的类型）
  - `.ampln` JSON Schema 文件：
    - 定义 `name, version, nodes[], edges[], variables[]` 等字段与约束

- **后端（Node.js）**
  - 路由：
    - `POST /optimizePrompt`
    - `POST /generatePipeline`
    - `POST /renderPipeline`
  - 使用 Express/Fastify + 中间件（限流、日志、鉴权）
  - Swagger/OpenAPI 文档，描述请求/响应结构与错误码

- **文档**
  - 用户操作手册：
    - 如何打开 AI 助手、配置模型、生成并保存 Pipeline、处理错误
  - 模板开发指南：
    - 如何新增/修改 Prompt 模板、变量规范（{{ }} 占位符）
  - 部署与配置说明：
    - 如何部署 Node.js 服务、如何在 JupyterLab/Amphi 中启用前端入口
    - 配置环境变量（API 密钥、后端 URL）、安全注意事项

---

如果你愿意，我可以在现有代码基础上继续细化：

- 把 `AIAssistantIcon` 挂接到 `pipeline-editor/src/index.ts` 的插件激活流程中，让图标真实出现在 JupyterLab 界面上
- 为 `.ampln` 定义一个 JSON Schema/TypeScript 类型文件，并给出最小可运行的 Node.js 服务骨架（Express 版本），便于你直接启动 `/optimizePrompt`、`/generatePipeline`、`/renderPipeline` 三个接口。