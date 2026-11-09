import {searchMemes,stageMeme,libraryRows} from './lib/meme-library.mjs';
const query=process.argv.slice(2).join(' ');console.log(JSON.stringify(query?searchMemes(query).map(r=>({caption:r.caption,tag:r.tag,source:r.pack,path:stageMeme(r.original)})):{images:libraryRows().length,usage:'./node-run.sh memes.mjs 得意 开心 或其他关键词；搜索新图也会读取最新收藏和启用图库'},null,2));
