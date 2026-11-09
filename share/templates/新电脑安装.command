#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
[ "$(uname -s)" = Darwin ] || { echo '此安装入口仅支持 macOS。'; exit 1; }
command -v python3 >/dev/null || { echo '请先安装 Python 3，详见交付文档。'; exit 1; }
[ -f .share-edition ] || { echo '请使用完整解压后的共享包。'; exit 1; }
chmod u+x ./*.sh ./*.command migrate/*.sh
python3 初始化配置.py --secrets
./setup.sh
echo '安装脚本执行结束。请查看输出中的待完成项，按交付文档连接插件、登录账号并绑定主人私聊。'
echo '所有自主运营默认关闭，需你检查并主动启用。'
read -r -p '按回车关闭'
