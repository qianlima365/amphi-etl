## 脚本功能概述

- 创建并激活 Python 虚拟环境(.venv)。
- 安装 JupyterLab 与两个子项目 amphi-scheduler、amphi-etl（editable 模式）。
- 校验扩展状态（server 和 labextension）。
- 启动应用：优先使用 amphi CLI，缺失则回退到 python -m amphi.main。
- 可选开发模式启动（JupyterLab --dev-mode）。
- 可选启动前端扩展 watch（UI、主题、调度器），Windows 在新 PowerShell 窗口中运行，Linux 后台运行。

### Windows 使用示例

- 如执行策略限制，可在会话内允许：
  - Set-ExecutionPolicy -Scope Process Bypass
- 启动：
  - powershell -ExecutionPolicy Bypass -File d:\mycode\amphi-etl\scripts\start-amphi.ps1
- 指定参数（工作目录、端口、开发模式、watch）：
  - powershell -ExecutionPolicy Bypass -File d:\mycode\amphi-etl\scripts\start-amphi.ps1 -Workspace "d:\data\amphi-workspace" -Port 9999 -DevMode -WatchUI -WatchScheduler

### Linux 使用示例

- 赋予执行权限：
  - chmod +x d:\mycode\amphi-etl\scripts\start-amphi.sh
- 启动（默认当前路径为仓库根）：
  - ./scripts/start-amphi.sh
- 指定参数与 watch：
  - ./scripts/start-amphi.sh -r /path/to/amphi-etl -w /path/to/workspace -p 9999 -i 0.0.0.0 -d --watch-ui --watch-scheduler
参数说明

- Windows
  - -RepoRoot 仓库根目录，默认 d:\mycode\amphi-etl
  - -Workspace 工作目录，默认 .
  - -Port 端口，默认 8888
  - -IP 监听地址，默认 localhost
  - -DevMode 开发模式
  - -WatchUI / -WatchTheme / -WatchScheduler 分别启用对应前端包的 watch
- Linux
  - -r RepoRoot，默认当前工作目录
  - -w Workspace，默认 .
  - -p Port，默认 8888
  - -i IP，默认 localhost
  - -d 开发模式
  - --watch-ui / --watch-theme / --watch-scheduler 对应启用 watch
提示

- 首次运行会自动创建 .venv 并安装依赖；后续重复运行会复用该环境。
- watch 功能依赖 jlpm；确保已安装 JupyterLab 并使用其自带 jlpm。
- 如需我为你的实际路径和端口生成固定参数版本（免传参），告诉我具体值即可替换脚本默认参数。