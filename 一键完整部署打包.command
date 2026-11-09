#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
./python-run.sh share/fetch_components.py
./python-run.sh share/build_deploy.py --output "$HOME/Desktop/DSH-Automation-Deploy-Mac-$(date +%Y%m%d-%H%M%S).zip"
read -r -p '完整脱敏部署包已生成，按回车关闭'
