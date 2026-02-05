# 智能 Pipeline 生成 Agent 系统：功能设计与技术架构设计

## 1. 目标与范围
- 目标：在现有 AI 助手能力中集成一个“Pipeline 生成 Agent”，通过自然语言对话自动生成符合约定格式（YAML/JSON/.ampln）的 Pipeline，并通过校验与预览辅助用户确认与保存。
- 范围：前端（对话交互、预览、配置）、后端（意图识别、模板系统、节点文档解析、拓扑构建、验证与渲染）、与现有 LLM 适配层集成。

## 2. 功能设计
### 2.1 意图识别模块
- 输入：用户连续对话文本，附件（txt/md/json）可选。
- 输出：意图类型与置信度（pipeline_generate | pipeline_edit | none）。
- 识别策略：
  - 关键词/模式匹配：pipeline、流程图、ETL、节点、数据源、映射、DAG 等；正则识别“生成/创建/导出”+“pipeline/流程”。
  - 轻量分类器：基于 LLM 少样本分类或本地规则模型，输出置信度（0–1）。
  - 上下文融合：最近 N 轮对话（≥10）拼接特征，避免单轮误判。
- 触发条件：置信度阈值（默认 0.6，可配置）；阈下展示“建议生成”提示，允许用户确认。

### 2.2 Agent 架构与提示词模板系统
- 固定模板系统：
  - 元信息：版本、作者、创建时间、适用场景（ETL Pipeline 构建）、必填/选填参数说明。
  - 模板结构：系统提示（职责边界、输出格式要求）、占位符（{{variable}}）支持枚举/默认值/正则校验。
  - 多模板与选择：按场景（数据同步/批处理/实时流/非结构化处理）挑选合适模板。
- 文档解析能力：
  - 支持读取与解析 Markdown/YAML 节点说明文档，提取节点类型、参数、输入/输出规范、依赖约束。
  - 附件或内置资源：支持从仓库 docs/ 或用户上传附件中加载说明。
- 动态构建：
  - 基于解析出的节点库与用户需求，进行节点筛选、参数填充、连接关系组装，生成 DAG。

### 2.3 Pipeline 生成工作流
- 步骤（前端与后端协作）：
  1. 需求解析：抽取关键实体（数据源、目标、转换、约束、期望结果）。
  2. 节点匹配：根据节点说明文档（md/yaml）库进行候选匹配（字符串相似度 + 语义匹配）。
  3. 参数填充：将用户提供的参数与模板默认值融合，补齐必填项。
  4. 拓扑排序：基于输入/输出依赖构建 DAG，进行拓扑排序与环路检测。
  5. 依赖关系建立：生成 edges（有向边），添加变量/连接配置（credentials、schemas）。
  6. 输出生成：产出 YAML/JSON/.ampln；并返回校验报告（语法/逻辑）。
- 失败定位：对校验失败的节点/路径给出 `path`/`nodeId` 定位与修复建议。

### 2.4 节点说明文档解析器
- 支持格式：
  - Markdown：约定标题为节点名；表格或代码块中定义参数与 I/O；标签标注类别与约束。
  - YAML：结构化定义 `type/name/params/inputs/outputs/constraints/examples`。
- 解析输出（规范化 Model）：
```yaml
id: string
name: string
category: inputs|transforms|outputs|unstructured
params:
  - key: string
    type: string
    required: boolean
    default: any
    pattern: optional-regex
inputs:
  - name: string
    type: dataframe|stream|blob
outputs:
  - name: string
    type: dataframe|stream|blob
constraints:
  requires:
    - other_node_id
  incompatible:
    - other_node_id
```

### 2.5 Pipeline 验证机制
- 语法校验：基于 JSON Schema/YAML Schema 检查字段完整性与类型。
- 逻辑校验：
  - DAG 无环（环路检测）。
  - 输入/输出类型匹配（如 dataframe→transform→output）。
  - 参数必填项检查与格式校验（pattern、枚举）。
  - 资源兼容性（后端引擎、连接类型）。
- 验证报告：错误列表、警告、建议；提供自动修复（补默认值/断开非法边）选项。

### 2.6 输出规范
- 支持 YAML/JSON/.ampln 三种产出；推荐统一 `.ampln` JSON Schema：
```json
{
  "name": "project_x",
  "version": "1.0.0",
  "variables": {},
  "nodes": [
    {"id":"n1","type":"mysql_input","params":{"host":"...","table":"..."}, "outputs":["df_in"]},
    {"id":"n2","type":"transform_clean","params":{"rules":[...]}, "inputs":["df_in"], "outputs":["df_clean"]},
    {"id":"n3","type":"csv_output","params":{"path":"..."}, "inputs":["df_clean"]}
  ],
  "edges": [
    {"from":"n1","to":"n2","port":"df_in"},
    {"from":"n2","to":"n3","port":"df_clean"}
  ]
}
```
- 可视化描述（可选）：返回节点与边的平面布局信息（用于前端预览）。

## 3. 技术架构设计
### 3.1 模块划分
- 前端（JupyterLab/React）
  - Chat 交互：`AIChatModal`（多轮对话、附件上传、快捷指令）。
  - 模型配置区：模型通道选择、参数调节、系统提示词模板。
  - 预览：`PipelinePreview`（树形 + JSON 视图 + 缺失字段标红）。
  - 保存：`SaveConfirmDialog`（路径、命名、渲染选项）。
  - Intent UI：在识别到生成意图时，展示“生成 Pipeline”建议或自动切换到模板面板。
- 后端（Node.js）
  - IntentService：意图识别（规则 + 轻量 LLM 分类）与阈值控制。
  - TemplateService：模板库管理与占位符校验/渲染。
  - DocParser：解析 Markdown/YAML 节点文档；缓存解析结果。
  - GraphBuilder：节点匹配、参数填充、依赖建立、拓扑排序。
  - Validator：语法（JSON Schema）与逻辑验证。
  - Renderer：生成 YAML/JSON/.ampln；与现有渲染/导入接口对接。
  - LLMService 接口：复用统一 LLM 适配（OpenAI/Anthropic/Ollama 等）。
  - Logging & Metrics：结构化日志、耗时与命中率监控。

### 3.2 关键数据模型
- `IntentResult`：
```ts
{ intent: 'pipeline_generate'|'pipeline_edit'|'none', confidence: number, reasons?: string[] }
```
- `NodeSpec`（解析器输出）：
```ts
{ id:string, name:string, category:string, params:ParamSpec[], inputs:IOSpec[], outputs:IOSpec[], constraints?:ConstraintSpec }
```
- `PipelineModel`（最终产出）：见 2.6 示例。

### 3.3 主要接口（REST）
- `POST /agent/intents`：输入对话文本，返回 `IntentResult`。
- `POST /agent/generate`：输入系统提示词 + 用户需求 + 可选节点库，返回 `.ampln` JSON 与验证报告。
- `POST /agent/validate`：输入 `.ampln`，返回语法/逻辑验证结果。
- `POST /agent/preview`（可选）：返回可视化布局数据。

### 3.4 工作流与时序
- 前端：
  1. 用户输入 → 调用 `/agent/intents`
  2. 若识别为生成 → 显示模板并允许编辑 → 提交 `/agent/generate`
  3. 展示生成进度（解析→匹配→填参→DAG→校验→输出）
  4. 成功：展示预览 → 保存/渲染
  5. 失败：展示错误与定位 → 允许调整后重试
- 后端：
  - IntentService：判定意图；返回阈值与理由
  - TemplateService：组合系统提示词；渲染占位符
  - DocParser：加载/解析节点库（缓存）
  - GraphBuilder：生成 DAG 与 edges；处理依赖与端口
  - Validator：输出报告；失败时给出定位信息
  - Renderer：返回 `.ampln` 与可选 YAML/JSON

## 4. 错误处理与异常恢复
- 超时与重试：各接口设置超时（生成 ≤ 10s），指数退避重试（最多 2 次）。
- 降级策略：LLM 不可用时，回退到规则模板与固定映射（最小可用生成）。
- 失败定位：返回 `path/nodeId` 与建议；允许前端一键修复（补默认值/断边）。
- 幂等性：对同一对话/请求使用 `requestId` 保证幂等保存。

## 5. 日志与可观测性
- 结构化日志：`requestId/userId/intent/confidence/timing/errors`
- 指标：意图命中率、生成成功率、平均耗时、失败原因分布
- 追踪：对 `/agent/generate` 全链路打点；前端展示进度条与状态。

## 6. 安全与隐私
- HTTPS 强制；API Key 不落服务端（或使用服务端 Key，前端不上传用户 Key）。
- 脱敏：在发送给第三方优化/LLM 服务前进行敏感信息遮蔽。
- 访问控制：鉴权中间件（token/session）；RBAC 控制生成与保存权限。

## 7. 性能与体验要求
- 对话框首次加载 ≤ 800ms（懒加载组件与代码分割）。
- Pipeline 生成 ≤ 10s（节点 ≤ 50）。
- 保存 + 渲染 ≤ 5s（后端异步渲染可先反馈已提交）。

## 8. 测试与交付
- 单元测试：IntentService、DocParser、GraphBuilder、Validator 覆盖率 ≥ 80%。
- 集成测试：从用户输入到 `.ampln` 产出与验证的端到端流。
- 文档：
  - 系统架构文档（本文件）
  - 核心模块详细设计说明（Intent/Parser/Builder/Validator/Renderer）
  - 用户操作手册（对话→模板→生成→预览→保存/渲染）
  - API 文档（/agent/intents, /agent/generate, /agent/validate, /agent/preview）

## 9. 实施计划（建议）
- Phase 1：IntentService + TemplateService + 基础生成（无文档解析，规则模板）
- Phase 2：DocParser + GraphBuilder + Validator（完整生成闭环）
- Phase 3：可视化预览 + 进度与错误定位增强 + 性能优化
- Phase 4：测试完善 + 文档交付 + 灰度发布

