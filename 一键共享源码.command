#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
output="$HOME/Desktop/DSH-Automation-Share-$(date +%Y%m%d-%H%M%S).zip"
python3 share/export.py --output "$output"
echo '这是去除个人数据后的源码包。分享前请再核对自己后来加入的代码没有私人内容。'
read -r -p '按回车关闭'
