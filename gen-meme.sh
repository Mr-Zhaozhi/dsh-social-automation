#!/bin/bash
# 现场生成表情包（免费 Pollinations flux，无需 key），md5 缓存
# 用法: ./gen-meme.sh <tag> "<英文画面描述>"
set -euo pipefail
TAG="${1:-happy}"; DESC="${2:-}"; [ -z "$DESC" ] && { echo "用法: ./gen-meme.sh <tag> <英文描述>" >&2; exit 1; }
W="$(cd "$(dirname "$0")" && pwd)"; OUT="$W/memes/gen"; mkdir -p "$OUT"
CHAR="$W/character.txt"
[[ "$TAG" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'tag只能含英文、数字、下划线和连字符' >&2; exit 1; }
[ -f "$CHAR" ] || { echo '缺少 character.txt，未生成' >&2; exit 1; }
BIBLE=$(cat "$CHAR")
PROMPT="$BIBLE, $DESC, chat sticker, thick clean outline, flat pastel background, centered, simple, no text"
SLUG=$(printf '%s' "$TAG-$BIBLE-$DESC" | md5 -q | cut -c1-12)
FILE="$OUT/$TAG-$SLUG.jpg"
[ -f "$FILE" ] && { echo "$FILE"; exit 0; }
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$PROMPT")
URL="https://image.pollinations.ai/prompt/$ENC?width=512&height=512&nologo=true&model=flux&seed=$((16#${SLUG:0:6}))"
for i in 1 2; do
  curl -fsS --connect-timeout 10 -m 30 -o "$FILE.tmp" "$URL" || true
  if file "$FILE.tmp" | grep -qi "JPEG\|PNG"; then mv "$FILE.tmp" "$FILE"; echo "$FILE"; exit 0; fi
  [ "$i" = 1 ] && sleep 3 || true
done
rm -f "$FILE.tmp"; echo "生成失败（限流或网络），别硬刚，用图库里现成的" >&2; exit 1
