param(
  [string]$RepoRoot = "d:\mycode\amphi-etl",
  [string]$Workspace = ".",
  [int]$Port = 8888,
  [string]$IP = "localhost",
  [switch]$DevMode,
  [switch]$WatchUI,
  [switch]$WatchTheme,
  [switch]$WatchScheduler,
  [switch]$WatchCore,
  [switch]$WatchLocal
)

$ErrorActionPreference = "Stop"

function Write-Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Write-Warn($m) { Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Write-Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red }

$venv = Join-Path $RepoRoot ".venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
  Write-Info "创建虚拟环境: $venv"
  python -m venv $venv
}
$activate = Join-Path $venv "Scripts\Activate.ps1"
if (-not (Test-Path $activate)) { Write-Err "未找到 Activate.ps1: $activate"; exit 1 }
Write-Info "激活虚拟环境"
. $activate

Write-Info "安装依赖"
python -m pip install -U pip
python -m pip install "jupyterlab>=4,<5"
python -m pip install -e (Join-Path $RepoRoot "amphi-scheduler")
python -m pip install -e (Join-Path $RepoRoot "amphi-etl")

Write-Info "扩展状态"
python -m jupyter server extension list
python -m jupyter labextension list

function Start-Watch($dir) {
  if (-not (Get-Command jlpm -ErrorAction SilentlyContinue)) { Write-Warn "缺少 jlpm"; return }
  if (-not (Test-Path $dir)) { Write-Warn "目录不存在: $dir"; return }
  Write-Info "启动 watch: $dir"
  $cmd = "cd `"$dir`"; jlpm; jlpm watch:labextension"
  Start-Process -WindowStyle Normal -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $cmd | Out-Null
}

if ($WatchUI)       { Start-Watch (Join-Path $RepoRoot "amphi-etl\packages\ui-component") }
if ($WatchTheme)    { Start-Watch (Join-Path $RepoRoot "amphi-etl\packages\theme-light") }
if ($WatchScheduler){ Start-Watch (Join-Path $RepoRoot "amphi-scheduler\packages\pipeline-scheduler") }
if ($WatchCore)     { Start-Watch (Join-Path $RepoRoot "jupyterlab-amphi\packages\pipeline-components-core") }
if ($WatchLocal)    { Start-Watch (Join-Path $RepoRoot "jupyterlab-amphi\packages\pipeline-components-local") }

$workspaceAbs = (Resolve-Path -Path $Workspace -ErrorAction SilentlyContinue)
if ($workspaceAbs) { $Workspace = $workspaceAbs.Path }

if ($DevMode) {
  Write-Info "开发模式"
  python -m jupyter lab --notebook-dir="$Workspace" --port=$Port --ip="$IP" --dev-mode --ContentManager.allow_hidden=true
} else {
  $amphi = Get-Command amphi -ErrorAction SilentlyContinue
  if ($amphi) {
    Write-Info "使用 amphi CLI"
    amphi start -w $Workspace -p $Port -i $IP
  } else {
    Write-Warn "回退到 Python 入口"
    python -m amphi.main start -w $Workspace -p $Port -i $IP
  }
}
