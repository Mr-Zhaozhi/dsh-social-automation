#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -x "$ROOT/.runtime/bin/python3" ]; then exec "$ROOT/.runtime/bin/python3" "$@"; fi
if command -v python3 >/dev/null; then exec python3 "$@"; fi
PYTHON="/Applications/DSH Desktop.app/Contents/Resources/office-runtime/primary-runtime/dependencies/python/bin/python3"
[ -x "$PYTHON" ] || { echo '缺少 Python，请运行完整部署包的开始安装。' >&2; exit 1; }
exec "$PYTHON" "$@"
