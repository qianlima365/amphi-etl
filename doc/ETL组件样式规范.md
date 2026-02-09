# ETL 组件 UI 样式规范（Neon Future 主题）

本文档描述 Pipeline Editor 中 ETL 组件的视觉规范，以及 neon-future 主题下的配色、发光与响应式约定。

---

## 1. 主题体系

### 1.1 主题切换

- **Light**：默认亮色，无 body class。
- **Neon Future**：在 `body` 上增加 `neon-future-theme` class 后生效，所有 ETL 画布与配置面板样式由变量驱动。

### 1.2 变量配置文件

- **路径**：`jupyterlab-amphi/packages/pipeline-editor/style/neon-theme-variables.css`
- **作用**：在 `body.neon-future-theme` 下定义 CSS 自定义属性，供 `canvas.css` 等引用。
- **维护**：修改该文件中的变量即可全局调整主题色、发光强度、圆角等，无需改组件样式选择器。

### 1.3 主要变量一览

| 用途 | 变量名 | 说明 |
|------|--------|------|
| 背景 | `--neon-bg-primary/secondary/tertiary/elevated` | 深色背景层级 |
| 主色 | `--neon-accent`, `--neon-blue-400`, `--neon-purple-500` | 蓝紫霓虹强调色 |
| 渐变 | `--neon-gradient-accent`, `--neon-gradient-subtle` | 顶部条、发光 |
| 画布组件 | `--neon-component-bg`, `--neon-component-top-bar`, `--neon-component-selected-shadow` | 节点背景、顶条、选中发光 |
| 连接点 | `--neon-handle-bg`, `--neon-handle-hover-glow` | Handle 颜色与悬停发光 |
| 连接线 | `--neon-edge-stroke`, `--neon-edge-selected-stroke`, `--neon-edge-glow` | 边线颜色与选中发光 |
| 配置面板 | `--neon-modal-bg`, `--neon-modal-glow-border` | 弹窗背景与霓虹边框 |
| 表单 | `--neon-input-bg`, `--neon-input-focus-border`, `--neon-input-focus-shadow` | 输入框、聚焦边框与发光 |

---

## 2. 画布组件（节点）

### 2.1 结构

- 容器：`.component`（宽 180px，最小高 120px）。
- 顶部条：`.component::before`，高度由 `--neon-component-top-bar-height` 控制，Neon 下为蓝紫渐变 `--neon-component-top-bar`。
- 标题：`.component__header`，与 body 分隔线使用 `--neon-border`。
- 内容区：`.component__body`，表单项在此渲染。

### 2.2 Neon 主题下的视觉

- **背景**：`--neon-component-bg`（深灰蓝）。
- **边框**：1px `--neon-component-border`，圆角 `--neon-component-border-radius`（默认 6px）。
- **选中**：`.react-flow__node.selected .component` 使用 `--neon-component-selected-border` 与 `--neon-component-selected-shadow`（霓虹发光）。

### 2.3 连接点（Handle）

- 左右/下 Handle：背景 `--neon-handle-bg`，边框 `--neon-handle-border`。
- 悬停：`box-shadow: var(--neon-handle-hover-glow)`。

---

## 3. 连接线（Edge）

### 3.1 默认边

- 类名：`.react-flow__edge-path`。
- Neon：`stroke: var(--neon-edge-stroke)`，线宽 `--neon-edge-stroke-width`（默认 2px）。

### 3.2 选中边

- `.react-flow__edge.selected .react-flow__edge-path`：`stroke` 使用 `--neon-edge-selected-stroke`，并加 `filter: drop-shadow(var(--neon-edge-glow))`。

### 3.3 临时边（拖拽连接中）

- `.temp .react-flow__edge-path`：Neon 下为半透明蓝 `--neon-edge-temp-stroke`，虚线 `stroke-dasharray: 6 4`。

### 3.4 边上的删除按钮

- `.edgebutton`：Neon 下背景/边框使用 `--neon-bg-tertiary` / `--neon-border`，悬停时边框与 `box-shadow` 霓虹蓝发光。

---

## 4. 配置面板（Modal）

### 4.1 弹窗整体

- `.ant-modal-content`：背景 `--neon-modal-bg`，边框 `--neon-modal-border`，`box-shadow: var(--neon-modal-glow-border)`（霓虹发光边框）。
- `.ant-modal-header` / `.ant-modal-body` / `.ant-modal-footer`：背景与分割线统一为深色与 `--neon-modal-header-border`。

### 4.2 标题与关闭

- `.ant-modal-title`：`color: var(--neon-text-primary)`。
- `.ant-modal-close`：次要文字色，悬停时背景与文字高亮。

### 4.3 表单控件统一

- **输入框**：背景 `--neon-input-bg`，边框 `--neon-input-border`；hover/focus 时 `--neon-input-focus-border` 与 `--neon-input-focus-shadow`。
- **下拉**：`.ant-select-selector` 与输入框同套变量；下拉菜单 `.ant-select-dropdown` 深色背景，选中项主色高亮。
- **按钮**：默认按钮 `--neon-btn-default-bg/border`，主按钮 `--neon-btn-primary-bg/border`。
- **Tabs**：配置弹窗内 `.ant-tabs-tab` 使用阶梯文字色，激活与 ink-bar 使用 `--neon-accent` / `--neon-gradient-accent`。

### 4.4 其他块级

- Card / Divider：在 `.ant-modal-body` 内使用 `--neon-bg-tertiary`、`--neon-bg-elevated` 与对应文字变量。

---

## 5. 侧边栏与控件

- **组件面板**：`.sidebar` 使用 `--neon-bg-secondary`，搜索框、按钮、折叠面板与组件格子统一深色与边框变量。
- **画布缩放控件**：`.react-flow__controls` 与按钮使用 `--neon-bg-tertiary` 与悬停高亮。
- **节点工具栏**：`.react-flow__node-toolbar` 与按钮与上述控件风格一致。

---

## 6. 响应式

- **≤768px**：组件 `min-height` 略减；Modal `max-width: calc(100vw - 24px)`，左右留白。
- **高分辨率**：组件顶部渐变条使用 `backface-visibility: hidden` 减少模糊。
- 尺寸与间距优先使用主题变量与相对单位，以便在不同分辨率下保持比例一致。

---

## 7. 样式文件清单

| 文件 | 说明 |
|------|------|
| `style/neon-theme-variables.css` | 主题变量定义（仅变量，无选择器） |
| `style/canvas.css` | 画布、节点、边、配置弹窗、侧栏等全部 ETL 相关样式 |
| `style/ai-assistant.css` | AI 助手相关（非 ETL 画布） |
| `style/index.css` | 入口，按顺序引入 variables → ai-assistant → canvas |

---

## 8. 不同主题下的视觉对比

### 8.1 静态 Demo 页面

仓库内提供静态 HTML 用于快速预览变量效果（不依赖应用运行）：

- **路径**：`doc/theme-comparison-demo.html`
- **用法**：用浏览器直接打开，点击「切换到 Neon Future 主题」和「切换选中」查看节点与模拟弹窗的变量效果。

### 8.2 建议截图项（实际应用内）

建议在以下场景分别对 **Light** 与 **Neon Future** 截图对比：

1. **画布**：若干 ETL 节点（含输入/输出/转换）+ 连接线，未选中与选中状态。
2. **配置弹窗**：打开任一节点配置（如 Database Input），包含输入框、下拉、按钮、Tabs（若有）。
3. **侧边栏**：组件面板展开、搜索框与组件格子。
4. **小屏**：宽度约 768px 下画布与弹窗布局。

截图可存放于 `doc/assets/theme-comparison/`（需自行创建），便于后续设计与回归使用。

---

## 9. 与现有功能的兼容性

- 所有样式均为 **外观层**，不修改 DOM 结构或业务逻辑。
- 选择器均带 `.neon-future-theme` 或 `body.neon-future-theme`，Light 主题下不受影响。
- 若 React Flow 或 Ant Design 升级导致类名变化，只需在 `canvas.css` 中调整对应选择器，变量仍可从 `neon-theme-variables.css` 统一维护。
