#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 migrate/sync.py update
read -r -p '按回车关闭'
