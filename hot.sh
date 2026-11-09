#!/bin/bash
# 刷热榜/新闻：./hot.sh [all|weibo|douyin|zhihu|news|bili]
exec python3 "$(dirname "$0")/hot.py" "${1:-all}"
