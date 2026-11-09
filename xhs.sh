#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/node-run.sh" "$ROOT/xhs.mjs" "$@"
