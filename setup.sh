#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo '需要 Python 3（Homebrew: brew install python）'; exit 1; }
if [ "${1:-}" != '--finish' ] && [ "${1:-}" != '--no-install' ] && [ ! -x .runtime/bin/ffmpeg ]; then
  command -v npm >/dev/null || { echo '需要 Node.js 和 npm（Homebrew: brew install node）'; exit 1; }
  npm ci --no-audit --no-fund
fi
[ "${1:-}" = '--no-install' ] && shift
exec python3 lib/setup.py "$@"
