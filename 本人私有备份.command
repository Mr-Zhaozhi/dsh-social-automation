#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo '此入口会备份自己的账号凭据和记忆，仅供本人迁移；不能分享给其他人。'
./migrate/export.sh
read -r -p '按回车关闭'
