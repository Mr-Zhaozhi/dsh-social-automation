import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {workspace,harness,atomicJSON} from './runtime.mjs';import {sharedContext} from './shared-context.mjs';
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file));}catch{return fallback;}};
export function memeChannel(session){return sharedContext.sessionRoute(session)?.platform||null;}
export function memeInstructions(channel){if(!['qq','wechat'].includes(channel))return '';return `当前是${channel==='qq'?'QQ OneBot':'微信机器人'}，不是网页聊天。表情包要发送实际图片。先用 send_meme 搜情绪/关键词，${channel==='qq'?'把候选 absPath 或 path 交给 qq_send_image 的 sources 数组':'把候选 absPath 或 path 交给 send_wechat 的 file_path'}，收件人仅当前会话。正文不要写[表情:描述]、本地路径或图片占位符。轻松聊天、互损、开心时主动配图，通常2至4轮一张，严肃话题克制；不要反复同一张。缺图时换关键词搜其他已启用图库；再没有可用图，可用当前搜索工具找公开表情包并用 learn_meme 收录，禁止收藏私人照片/聊天截图/广告，失败就正常聊，不假装发图。`;}
const validImage=p=>{try{const b=fs.readFileSync(p);return b.length>32&&b.length<=8*1024*1024&&(b.subarray(0,3).equals(Buffer.from([255,216,255]))||b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||/^GIF8[79]a/.test(b.subarray(0,6).toString())||b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP');}catch{return false;}};
export function libraryRows({home=os.homedir()}={}){
 const base=path.join(home,'.dsh/meme-packs'),settings=read(path.join(home,'.dsh/dsh-expression.json'),{}),enabled=settings.enabledPacks||['huohuo-self','deepseek-chan','dsh-meme-user'];const rows=[];
 for(const pack of enabled.filter(p=>/^[\w-]+$/.test(p))){const folder=path.join(base,pack),file=path.join(folder,'index.db');if(!fs.existsSync(file))continue;let db;try{db=new DatabaseSync(file,{readOnly:true});for(const row of db.prepare('SELECT path,tag,caption,keywords FROM memes').all()){const original=path.resolve(folder,row.path);if(!original.startsWith(folder+path.sep)||!fs.existsSync(original))continue;const real=fs.realpathSync(original);if(!real.startsWith(fs.realpathSync(folder)+path.sep))continue;rows.push({...row,pack,original:real,id:createHash('sha256').update(real).digest('hex').slice(0,24)});}}catch{}finally{db?.close();}}
 return rows;
}
export function stageMeme(source,{root=workspace,home=os.homedir()}={}){
 const real=fs.realpathSync(source),roots=[path.join(home,'.dsh/meme-packs'),path.join(root,'memes'),fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-meme'))];if(!roots.some(base=>fs.existsSync(base)&&real.startsWith(fs.realpathSync(base)+path.sep))||!validImage(real))throw Error('不是可发送的图库图片');
 const hash=createHash('sha256').update(fs.readFileSync(real)).digest('hex'),ext=path.extname(real).toLowerCase();if(!/\.(png|jpe?g|gif|webp)$/.test(ext))throw Error('不支持的图片格式');const out=path.join(root,'memes/library',hash+ext);fs.mkdirSync(path.dirname(out),{recursive:true});if(!fs.existsSync(out))fs.copyFileSync(real,out);return out;
}
export function searchMemes(query,{root=workspace,home=os.homedir(),chatId='',limit=6}={}){
 const q=String(query||'').trim().toLowerCase().replace(/小?鲸鱼娘|deepseek|大肥鱼|表情包/g,'').slice(0,100),words=[...new Set([...(q.match(/[a-z]{2,}/g)||[]),...(q.match(/[\p{Script=Han}]{2,}/gu)||[]).flatMap(s=>Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)))])];
 const mood=/得意|好耶|开心|哈哈|成功/.test(q)?'happy':/委屈|难过|哭/.test(q)?'sad':/无语|疑惑|问号/.test(q)?'confused':/生气|炸毛|愤怒/.test(q)?'angry':null;
 const use=read(path.join(root,'.state/meme-usage.json'),{})[chatId]||[],recent=new Set(use.slice(-8).map(x=>x.id));
 const animated=/动图|动态|\bgif\b/i.test(q);
 return libraryRows({home}).filter(r=>(!mood||r.tag===mood)&&(!animated||r.original.toLowerCase().endsWith('.gif'))).map(row=>{const text=(row.caption+' '+row.keywords+' '+row.tag).toLowerCase();return {...row,score:(row.caption===query?1000:0)+words.reduce((n,w)=>n+(text.includes(w)?3:0),0)+(text.includes(q)&&q?8:0)+(row.pack.startsWith('huohuo-')&&mood?5:0)-(recent.has(row.id)?6:0),recent:recent.has(row.id)};}).filter(r=>r.score+(r.recent?6:0)>0).sort((a,b)=>b.score-a.score||Number(a.recent)-Number(b.recent)||Number(b.pack.startsWith('huohuo-'))-Number(a.pack.startsWith('huohuo-'))).slice(0,limit);
}
export function prepareMemeReply(text,chatId,options={}){
 let selected;const clean=String(text).replace(/\[表情(?:包)?\s*[:：]\s*([^\]\n]{1,160})\]/g,(_all,query)=>{if(!selected){const match=searchMemes(query,{...options,chatId,limit:1})[0];if(match)try{selected={...match,file:stageMeme(match.original,options)};}catch{}}return '';}).trim();return {text:clean,meme:selected};
}
export function recordMemeUse(chatId,meme,status,{root=workspace,receipt}={}){if(!meme)return;const file=path.join(root,'.state/meme-usage.json'),state=read(file,{});const list=state[chatId]||=[];if(status==='pending')list.push({id:meme.id,at:Date.now(),status});else{const row=list.findLast(r=>r.id===meme.id&&r.status==='pending');if(row)Object.assign(row,{status,receipt});}state[chatId]=list.slice(-30);atomicJSON(file,state);}

export function memeImageData(file){if(!validImage(file))throw Error("无效表情图片");return "base64://"+fs.readFileSync(file).toString("base64");}
