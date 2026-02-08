# Neon Future Theme - Installation Guide

## 快速安装（推荐）

在 Windows PowerShell 中运行：

```powershell
cd amphi-etl/packages/theme-neon-future
.\install-theme.ps1
```

## 手动安装步骤

### 前提条件
- Node.js 18+ 
- JupyterLab 4.0+
- jlpm (通常随 JupyterLab 安装)

### 步骤 1: 安装依赖

```bash
cd amphi-etl/packages/theme-neon-future
jlpm install
```

### 步骤 2: 构建项目

```bash
# 构建 TypeScript 源文件
jlpm run build:lib

# 构建 JupyterLab 扩展
jlpm run build:labextension
```

### 步骤 3: 安装到 JupyterLab

**方法 A - 开发模式（推荐开发时使用）:**
```bash
jupyter labextension develop --overwrite .
```

**方法 B - 生产模式:**
```bash
jupyter labextension install . --no-build
jupyter lab build
```

## 故障排除

### 问题 1: 主题未出现在主题列表中

**症状**: Settings > Theme 中没有 "Neon Future" 选项

**解决方案**:

1. 检查扩展是否已安装：
```bash
jupyter labextension list
```

应该能看到：
```
@amphi/theme-neon-future v1.0.0 enabled OK
```

2. 如果没有显示，尝试重新安装：
```bash
jupyter labextension uninstall @amphi/theme-neon-future
jupyter lab clean
jupyter labextension install .
jupyter lab build
```

3. 检查 `package.json` 中的 `jupyterlab` 配置：
```json
"jupyterlab": {
  "extension": true,
  "themePath": "style/index.css",
  "outputDir": "../../amphi/theme-neon-future",
  "theme": true
}
```
确保 `"theme": true` 存在！

### 问题 2: 构建失败

**症状**: `jlpm run build` 或 `jupyter lab build` 失败

**解决方案**:

1. 清理并重新构建：
```bash
# 在主题目录中
jlpm run clean:all
jlpm install
jlpm run build
```

2. 检查 TypeScript 版本兼容性：
```bash
jlpm list typescript
```

3. 如果从 monorepo 根目录构建：
```bash
# 在 amphi-etl 根目录
cd ../..
jlpm install
jlpm run build
```

### 问题 3: 样式未生效

**症状**: 主题已选择但界面没有变化

**解决方案**:

1. 强制刷新浏览器缓存：
   - Windows: `Ctrl + F5`
   - Mac: `Cmd + Shift + R`

2. 检查样式文件是否正确构建：
```bash
ls amphi-etl/amphi/theme-neon-future/
# 应该看到 index.css 和其他文件
```

3. 检查浏览器控制台是否有 404 错误

### 问题 4: 在 monorepo 中无法识别

**症状**: 主题在其他包中不可见

**解决方案**:

1. 确保根 `package.json` 包含工作区：
```json
"workspaces": {
  "packages": [
    "packages/theme-light",
    "packages/theme-neon-future",
    "packages/ui-component"
  ]
}
```

2. 从根目录运行 lerna bootstrap：
```bash
cd amphi-etl
npx lerna bootstrap
```

3. 重新构建整个项目：
```bash
jlpm run clean:all
jlpm install
jlpm run build
```

## 验证安装

运行以下命令检查主题是否正确安装：

```bash
# 1. 检查扩展列表
jupyter labextension list

# 2. 检查主题文件
ls amphi-etl/amphi/theme-neon-future/

# 3. 检查是否能加载
python -c "
from jupyterlab_server.themes import ThemesManager
import json
print('Themes module available')
"
```

## 卸载主题

```bash
jupyter labextension uninstall @amphi/theme-neon-future
jupyter lab build
```

## 开发模式

开发时可以使用 watch 模式：

```bash
# 终端 1: 监视 TypeScript 变化
jlpm run watch:src

# 终端 2: 监视扩展变化
jlpm run watch:labextension
```

然后启动 JupyterLab：
```bash
jupyter lab --watch
```

## 常见问题 (FAQ)

**Q: 主题安装后 JupyterLab 启动变慢？**
A: 这是正常的，因为 JupyterLab 需要编译新的样式。后续启动会恢复正常。

**Q: 可以与其他主题共存吗？**
A: 可以！您可以随时在 Settings > Theme 中切换主题。

**Q: 如何修改颜色？**
A: 编辑 `style/variables.css` 中的 CSS 变量，然后重新构建。

**Q: 主题会影响性能吗？**
A: 主题使用 CSS 硬件加速效果，在现代浏览器中性能良好。如遇到性能问题，可以在 `variables.css` 中减少模糊效果。

## 获取帮助

如果以上步骤都无法解决问题：

1. 查看 JupyterLab 日志：
```bash
jupyter lab --debug 2>&1 | findstr theme
```

2. 检查浏览器开发者工具 (F12) 的控制台错误

3. 确保所有依赖版本兼容：
```bash
jupyter --version
jlpm --version
node --version
```
