#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/.runtime/bin:$PATH"
if command -v node >/dev/null 2>&1; then exec node "$@"; fi
NODE="$HOME/Library/Application Support/dsh-desktop/harness/.desktop-bin/node"
[ -x "$NODE" ] || { echo '缺少 Node.js，请运行 setup.sh' >&2; exit 1; }
exec "$NODE" "$@"
