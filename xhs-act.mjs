import {assertPlatformAvailable} from './lib/platform-holds.mjs';
assertPlatformAvailable('xiaohongshu');
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {browser,workspace,atomicJSON,lock,day} from './lib/runtime.mjs';
import {socialBudget} from './lib/social-budget.mjs';import {clickPublish} from './lib/xhs-browser.mjs';
import {beginWatch} from './lib/watch-budget.mjs';
import {verifyVideo} from './lib/video-quality.mjs';
import {managedPage,closeTemporary} from './lib/browser-pages.mjs';
import {assertRunner,assertWatcher} from './lib/fleet.mjs';
import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
const args=process.argv.slice(2),cmd=args[0],opt=k=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:'';
const ledger=path.join(workspace,'.state/xhs-actions.json'),read=()=>fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger)):[];
function record(id,status,data={}){const rows=read();let row=rows.find(r=>r.id===id);if(!row){row={id,date:day()};rows.push(row);}Object.assign(row,{status,...data});atomicJSON(ledger,rows);}
if(!['like','comment','publish-video'].includes(cmd)||!args.includes('--confirm'))throw new Error('用法: like --url 笔记链接 --confirm | comment --url 链接 --text 正文 --confirm | publish-video --video 文件 --title 标题 --desc 正文 --confirm [--adopt]');
const release=lock('browser-actions');let b,p,budget,timer,submitted=false;
try{
 await assertRunner();
 b=await browser();const ctx=b.contexts()[0];
 if(cmd==='publish-video'){
  const file=path.resolve(opt('video')),title=opt('title'),desc=opt('desc');if(!fs.existsSync(file)||!title||[...title].length>20||!desc)throw new Error('素材、标题或正文不合法');
  const id=crypto.createHash('sha256').update(fs.readFileSync(file)).update(title+desc).digest('hex');
  if(read().some(r=>r.id===id&&r.status!=='not-sent'))throw new Error('作品已有提交记录，不重复发布');
  verifyVideo(file);
  if(args.includes('--adopt')){
   const pages=ctx.pages().filter(p=>p.url().startsWith('https://creator.xiaohongshu.com/publish/publish'));if(pages.length!==1)throw new Error('只能续用唯一现有发布页面');p=pages[0];
   if(await p.getByPlaceholder('填写标题会有更多赞哦').inputValue()!==title||(await p.locator('[contenteditable=true]').innerText()).trim()!==desc.trim())throw new Error('现有草稿内容不匹配');
   if(!await p.getByText(path.basename(file),{exact:true}).count())throw new Error('现有草稿视频文件名不匹配');
  }else{
   p=await managedPage(ctx,'xhs-publish');
   if(p.url().includes('/publish/publish')&&await p.locator('[contenteditable=true]').count())throw new Error('已有发布草稿，请核对后使用 --adopt，不覆盖原稿');
   await p.goto('https://creator.xiaohongshu.com/publish/publish?source=official',{waitUntil:'domcontentloaded'});await p.locator('input[type=file]').setInputFiles(file);
   await p.getByPlaceholder('填写标题会有更多赞哦').fill(title,{timeout:90000});await p.locator('[contenteditable=true]').fill(desc);
  }
  if(await p.getByText('添加内容类型声明',{exact:true}).count()){await p.getByText('添加内容类型声明',{exact:true}).click();await p.getByText('笔记含AI合成内容',{exact:true}).click();}
  await p.locator('xhs-publish-btn[submit-disabled="false"]').waitFor({timeout:90000});
  if(!await p.getByText('笔记含AI合成内容',{exact:true}).count())throw new Error('AI声明尚未确认');
  const result=await socialBudget.run('xiaohongshu','post',id,async()=>{
   record(id,'pending',{kind:'post',title});await clickPublish(p);
   try{await Promise.any([p.waitForURL(/publish\/success|manage/,{timeout:25000}),p.getByText('发布成功',{exact:true}).waitFor({timeout:25000})]);record(id,'submitted',{kind:'post',title,url:p.url()});return {confirmed:true,status:'submitted',title,url:p.url()};}
   catch{record(id,'unknown');throw new Error('发布结果待确认，请核查笔记管理，禁止重发');}
  });submitted=true;console.log(JSON.stringify(result));
 }else{
  await assertWatcher('xiaohongshu');await assertBrowserAvailable();
  budget=beginWatch();timer=setTimeout(()=>void p?.close(),budget.allowedMs);
  const url=new URL(opt('url'));if(url.protocol!=='https:'||url.hostname!=='www.xiaohongshu.com'||!/^\/explore\/[a-f0-9]{24}$/.test(url.pathname))throw new Error('需要完整小红书笔记链接');
  const noteId=url.pathname.split('/').at(-1),id=cmd+':'+noteId;
  if(read().some(r=>r.id===id&&r.status!=='not-sent'))throw new Error('此笔记已有操作记录，不重复发送或取消点赞');
  if(args.includes('--adopt')){for(const q of ctx.pages())if(q.url().includes('/explore/'+noteId)&&await q.locator('#content-textarea').count()&&(await q.locator('#content-textarea').innerText()).trim()===opt('text')){if(p)throw new Error('多个相同草稿，未操作');p=q;}}
  if(!p){p=await managedPage(ctx,'xhs-interaction');await p.goto(url.href,{waitUntil:'domcontentloaded'});}await p.locator('#detail-desc').waitFor({timeout:20000});
  const root=p.locator('.note-container').filter({has:p.locator('#detail-desc')});if(await root.count()!==1)throw new Error('笔记容器不唯一');
  const title=await root.locator('#detail-title').innerText();
  if(cmd==='like'){
   const button=root.locator('.like-wrapper'),icon=button.locator('svg use');const before=await icon.getAttribute('href');
   if(['#liked','#liked_b'].includes(before)){record(id,'already',{kind:'like',noteId,title});console.log('原本已点赞');}
   else{
    if(before!=='#like_b')throw new Error('不认识当前点赞状态，未点击');
    record(id,'pending',{kind:'like',noteId,title});await button.click();
    await p.waitForFunction(()=>['#liked','#liked_b'].includes(document.querySelector('.note-container .like-wrapper svg use')?.getAttribute('href')),null,{timeout:5000});
    record(id,'confirmed');console.log(JSON.stringify({confirmed:true,kind:'like',noteId,title}));
   }
  }else{
   const text=opt('text');if(!text||[...text].length>200)throw new Error('评论须为1至200字');
   const editor=root.locator('#content-textarea');if((await editor.innerText()).trim()&&(!args.includes('--adopt')||(await editor.innerText()).trim()!==text))throw new Error('已有草稿，未覆盖');
   const me=await p.locator('a').filter({hasText:/^我$/}).first().getAttribute('href');
   const result=await socialBudget.run('xiaohongshu','comment',noteId,async()=>{
    record(id,'pending',{kind:'comment',noteId,title,text});
    let dispatchStarted=false;
    try{if(await root.locator('.not-active').isVisible())await root.locator('.not-active').click({timeout:5000});await editor.fill(text);const send=root.getByRole('button',{name:'发送',exact:true});await send.click({trial:true,timeout:5000});dispatchStarted=true;await send.click({timeout:8000});}
    catch(e){record(id,dispatchStarted?'unknown':'not-sent',{reason:'填写/点击未完成'});e.beforeDelivery=!dispatchStarted;throw e;}
    const own=root.locator('.comment-item').filter({hasText:text}).filter({has:p.locator('a[href*="'+me.split('/').at(-1)+'"]')});
    try{await own.waitFor({state:'visible',timeout:12000});const commentId=await own.getAttribute('id');record(id,'confirmed',{commentId});return {confirmed:true,noteId,commentId};}
    catch{record(id,'unknown');throw new Error('评论回执待确认，不重复发送');}
   });console.log(JSON.stringify(result));
  }
 }
}finally{clearTimeout(timer);try{if(p)await p.evaluate(()=>document.querySelectorAll('video').forEach(v=>v.pause())).catch(()=>{});if(cmd!=='publish-video'||submitted)await closeTemporary(p);await b?.close();}finally{try{budget?.finish();}finally{release();}}}
