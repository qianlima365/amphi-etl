# Pipeline Editor 样式说明

## 文件说明

| 文件 | 说明 |
|------|------|
| `neon-theme-variables.css` | **Neon Future 主题变量**：在 `body.neon-future-theme` 下定义 CSS 自定义属性，供全局引用。修改此文件即可调整主题色、发光、圆角等。 |
| `canvas.css` | 画布、ETL 节点、连接线、配置弹窗、侧边栏、Launcher 等全部样式；含 Light 默认与 Neon 覆盖。 |
| `ai-assistant.css` | AI 助手相关样式。 |
| `index.css` | 入口：按顺序 `@import` variables → ai-assistant → canvas。 |

## 主题切换

- 应用在 `body` 上添加或移除 `neon-future-theme` class 来切换主题。
- 变量仅在 `body.neon-future-theme` 下生效，Light 主题不受影响。

## 规范与测试

- 组件样式规范与变量说明见仓库根目录：`doc/ETL组件样式规范.md`。
- 功能与视觉测试清单见：`doc/ETL主题改造测试报告.md`。
