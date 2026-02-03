#!/usr/bin/env bash
set -euo pipefail

RepoRoot="${REPO_ROOT:-$(pwd)}"
Workspace="${WORKSPACE:-.}"
Port="${PORT:-8888}"
IP="${IP:-localhost}"
DevMode=0
WatchUI=0
WatchTheme=0
WatchScheduler=0
WatchCore=0
WatchLocal=0

while getopts ":r:w:p:i:d" opt; do
  case "$opt" in
    r) RepoRoot="$OPTARG" ;;
    w) Workspace="$OPTARG" ;;
    p) Port="$OPTARG" ;;
    i) IP="$OPTARG" ;;
    d) DevMode=1 ;;
    \?) ;;
  esac
done
shift $((OPTIND-1))
for arg in "$@"; do
  case "$arg" in
    --watch-ui) WatchUI=1 ;;
    --watch-theme) WatchTheme=1 ;;
    --watch-scheduler) WatchScheduler=1 ;;
    --watch-core) WatchCore=1 ;;
    --watch-local) WatchLocal=1 ;;
  esac
done

if [ ! -x "$RepoRoot/.venv/bin/python" ]; then
  python3 -m venv "$RepoRoot/.venv"
fi
. "$RepoRoot/.venv/bin/activate"
python -m pip install -U pip
python -m pip install "jupyterlab>=4,<5"
python -m pip install -e "$RepoRoot/amphi-scheduler"
python -m pip install -e "$RepoRoot/amphi-etl"

python -m jupyter server extension list
python -m jupyter labextension list

start_watch() {
  dir="$1"
  if [ -d "$dir" ] && command -v jlpm >/dev/null 2>&1; then
    (cd "$dir" && jlpm && jlpm watch:labextension) &
  fi
}

if [ "$WatchUI" -eq 1 ]; then start_watch "$RepoRoot/amphi-etl/packages/ui-component"; fi
if [ "$WatchTheme" -eq 1 ]; then start_watch "$RepoRoot/amphi-etl/packages/theme-light"; fi
if [ "$WatchScheduler" -eq 1 ]; then start_watch "$RepoRoot/amphi-scheduler/packages/pipeline-scheduler"; fi
if [ "$WatchCore" -eq 1 ]; then start_watch "$RepoRoot/jupyterlab-amphi/packages/pipeline-components-core"; fi
if [ "$WatchLocal" -eq 1 ]; then start_watch "$RepoRoot/jupyterlab-amphi/packages/pipeline-components-local"; fi

if [ "$DevMode" -eq 1 ]; then
  python -m jupyter lab --notebook-dir="$Workspace" --port="$Port" --ip="$IP" --dev-mode --ContentManager.allow_hidden=true
else
  if command -v amphi >/dev/null 2>&1; then
    amphi start -w "$Workspace" -p "$Port" -i "$IP"
  else
    python -m amphi.main start -w "$Workspace" -p "$Port" -i "$IP"
  fi
fi
