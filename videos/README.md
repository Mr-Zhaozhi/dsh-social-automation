# 视频规格

`make-video.py` 从 JSON spec 合成 15–90 秒、带字幕与固定音色的作品。需要自己的 voice.id、API Key 和 3–6 个不同素材，至少一份 GIF。配音全文建议 70–160 字；分镜 beats 逐个拼接必须严格等于 text。

示例结构（替换全部示例值后使用）：

```json
{
  "title": "自己的故事标题",
  "text": "分镜一正文分镜二正文分镜三正文",
  "assets": ["memes/huohuo-self-1.png", "memes/huohuo-self-2.gif", "memes/huohuo-self-3.png"],
  "beats": ["分镜一正文", "分镜二正文", "分镜三正文"]
}
```

运行 `python3 make-video.py --spec videos/自己的规格.json --out videos/自己的成片.mp4`。先本地观看和听完，再决定发布。上面的短文案仅展示结构，不满足成片长度要求。
