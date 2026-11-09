#!/bin/bash
# 把图库（内置包 + 我的收藏 + 订阅包）复制到工作区 memes/，供 qq_send_image 发送
W="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$W/memes"
cp -f "$HOME"/.dsh/meme-packs/dsh-meme-user/memes/*/*.* "$W/memes/" 2>/dev/null
for d in "$HOME"/.dsh/meme-packs/*/; do
  id=$(basename "$d"); [ "$id" = "dsh-meme-user" ] && continue
  for f in "$d"/memes/*/*.*; do
    [ -e "$f" ] || continue
    tag=$(basename "$(dirname "$f")")
    cp -f "$f" "$W/memes/$id-$tag-$(basename "$f")" 2>/dev/null
  done
done
echo "$(ls -1 "$W"/memes | wc -l | tr -d ' ') 张已同步"
