import fs from 'node:fs';import path from 'node:path';
import {browser,workspace,atomicJSON,waitForLock} from './lib/runtime.mjs';import {assertRunner,assertWatcher} from './lib/fleet.mjs';import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';import {beginWatch} from './lib/watch-budget.mjs';import {socialBudget} from './lib/social-budget.mjs';import {accessProblem,textKey,assertMaySend} from './lib/zhihu-state.mjs';
import {assertHomeAccess,homeTarget,uniqueCard,guardDrafts,expandCard,openComments,visibleComments,ownCommentReceipt} from './lib/zhihu-home.mjs';
const args=process.argv.slice(2),cmd=args[0],opt=n=>args.includes('--'+n)?args[args.indexOf('--'+n)+1]:'';
const config=JSON.parse(fs.readFileSync(path.join(workspace,'zhihu.json'))),accessFile=path.join(workspace,'.state/zhihu-home-access.json'),ledgerFile=path.join(workspace,'.state/zhihu-deliveries.json'),read=(f,d)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):d;
if(!['status','browse','read','like','comment','reply','comments'].includes(cmd))throw new Error('首页模式支持 status/browse/read/like/comment/reply/comments；不打开详情页');
let b,p,release,budget,timer,dispatched=false,denied=false,denials=[];
async function check(){
 const problem=accessProblem((await p.locator('body').innerText()).slice(0,18000),p.url());
 if(denied||problem){atomicJSON(accessFile,{blocked:true,reason:problem||'HTTP-403',operation:cmd,denials,at:new Date().toISOString()});throw new Error('知乎首页功能提示限制，已暂停首页操作');}
 if(p.url()!=='https://www.zhihu.com/')throw new Error('已离开知乎首页，停止操作');
}
async function identity(){
 await check();const button=p.locator('.AppHeader-profileEntry');if(await button.count()!==1)throw new Error('账号入口不唯一');
 if((await button.getAttribute('aria-expanded'))!=='true')await button.click();const link=p.getByRole('link',{name:'我的主页',exact:true});
 const href=await link.getAttribute('href');await button.click();if(href!==config.account.profile)throw new Error('当前账号不是授权账号');
}
async function send(kind,key,fn){
 if(!args.includes('--confirm'))throw new Error('写操作需要 --confirm');
 const ledger=read(ledgerFile,{});assertMaySend(ledger,key);await identity();
 const save=(status,extra={})=>{ledger[key]={status,at:new Date().toISOString(),...extra};atomicJSON(ledgerFile,ledger);};
 const action=async()=>{try{return await fn(()=>{save('pending');dispatched=true;},save);}catch(e){save(dispatched?'unknown':'not-sent',{error:e.message});e.beforeDelivery=!dispatched;throw e;}};
 return kind?socialBudget.run('zhihu',kind,key,action):action();
}
try{
 assertHomeAccess(config,read(accessFile,{}),cmd,args.includes('--resume'));
 await assertRunner();await assertBrowserAvailable();release=await waitForLock('browser-actions');b=await browser();
 const pages=b.contexts()[0].pages(),owned=[];for(const page of pages)if(page.url()==='https://www.zhihu.com/'&&await page.evaluate(()=>window.name)==='huohuo:zhihu-home')owned.push(page);
 const available=owned.length?owned:pages.filter(x=>x.url()==='https://www.zhihu.com/');
 if(available.length!==1)throw new Error('需要唯一已打开的知乎首页；未新建页面或打开详情');p=available[0];
 await check();await identity();await p.evaluate(()=>window.name='huohuo:zhihu-home');
 p.on('response',r=>{if(r.status()===403&&new URL(r.url()).hostname.endsWith('zhihu.com')){denied=true;denials.push({method:r.request().method(),path:new URL(r.url()).pathname});}});
 if(cmd==='status'){if(args.includes('--resume'))atomicJSON(accessFile,{blocked:false,at:new Date().toISOString()});console.log(JSON.stringify({loggedIn:true,mode:'home',account:config.account,detailStillBlocked:read(path.join(workspace,'.state/zhihu-access.json'),{}).blocked===true}));}
 else{
  await assertWatcher('zhihu');budget=beginWatch({platform:'zhihu',maxSeconds:120});timer=setTimeout(()=>{denied=true;void p.close().catch(()=>{});},budget.allowedMs);
  if(cmd==='browse'){
   await guardDrafts(p);const screens=Number(opt('screens')||3);if(!Number.isInteger(screens)||screens<1||screens>5)throw new Error('浏览屏数应为1至5');
   const snapshot=()=>p.locator('.ContentItem').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.bottom>80&&r.top<innerHeight;}).map(e=>({url:[...e.querySelectorAll('meta[itemprop="url"]')].map(x=>x.content).find(x=>/\/answer\/|zhuanlan.zhihu.com\/p\//.test(x)),title:e.querySelector('.ContentItem-title')?.innerText})).filter(x=>x.url&&x.title));
   const steps=[await snapshot()];for(let i=1;i<screens;i++){
    let next;for(let attempt=0;attempt<5;attempt++){const y=await p.evaluate(()=>scrollY);await p.mouse.move(600,500);await p.mouse.wheel(0,Math.round((await p.evaluate(()=>innerHeight))*.85));await p.waitForFunction(y=>Math.abs(scrollY-y)>80,y,{timeout:5000});await check();next=await snapshot();if(next.length&&JSON.stringify(next.map(x=>x.url))!==JSON.stringify(steps.at(-1).map(x=>x.url)))break;}
    if(!next?.length||JSON.stringify(next.map(x=>x.url))===JSON.stringify(steps.at(-1).map(x=>x.url)))throw new Error('滚动后没有新卡片，未声称已翻页');steps.push(next);
   }
   const items=[...new Map(steps.flat().map(x=>[x.url,x])).values()];const result={at:new Date().toISOString(),mode:'home',screens:steps,items};atomicJSON(path.join(workspace,'.state/zhihu-browse.json'),result);console.log(JSON.stringify(result));
  }else{
   const target=homeTarget(opt('url'));const {card,content}=await expandCard(p,target);await check();
   atomicJSON(path.join(workspace,'.state/zhihu-home-read.json'),{url:target.url,at:new Date().toISOString(),characters:content.text.length,complete:!content.truncated});
   if(cmd==='read')console.log(JSON.stringify(content));
   else if(cmd==='like'){
    const button=card.locator('button.VoteButton:not(.VoteButton--down)');if(await button.count()!==1)throw new Error('赞同按钮不唯一');
    const active=()=>button.evaluate(e=>e.classList.contains('is-active')||e.getAttribute('aria-pressed')==='true'||(e.getAttribute('aria-label')||'').includes('取消赞同'));
    if(await active())console.log(JSON.stringify({confirmed:true,alreadyLiked:true,url:target.url}));
    else console.log(JSON.stringify(await send(null,'like:'+target.url,async(mark,save)=>{await button.click({trial:true});await check();mark();await button.click();await p.waitForFunction(url=>{const card=[...document.querySelectorAll('.ContentItem')].find(e=>[...e.querySelectorAll('meta[itemprop="url"]')].some(m=>m.content===url));const b=card?.querySelector('button.VoteButton:not(.VoteButton--down)');return b&&(b.classList.contains('is-active')||b.getAttribute('aria-pressed')==='true'||(b.getAttribute('aria-label')||'').includes('取消赞同'));},target.url,{timeout:10000});await check();save('confirmed',{url:target.url});return {confirmed:true,url:target.url};})));
   }else{
    await openComments(p,target);await check();const rows=await visibleComments(card);
    if(cmd==='comments')console.log(JSON.stringify({url:target.url,comments:rows}));
    else{
     const text=opt('text').trim();if(text.length<2||text.length>500||content.truncated)throw new Error('需要完整正文与2至500字评论');await guardDrafts(card);
     let editor=card.locator('[contenteditable=true]').first();
     if(cmd==='reply'){
      const id=opt('comment-id'),quote=opt('quote'),author=opt('author');if(!/^\d+$/.test(id))throw new Error('回复需要稳定评论编号');
      const exact=rows.filter(x=>x.id===id&&x.text===quote&&x.author===author);if(exact.length!==1)throw new Error('原评论编号、作者或正文不一致');
      const row=card.locator(`[data-id="${id}"]`);await row.getByRole('button',{name:'回复',exact:true}).click();editor=row.locator('[contenteditable=true]');if(await editor.count()!==1)throw new Error('线程回复编辑器不唯一');
     }
     const key=cmd+':'+target.url+':'+opt('comment-id')+':'+textKey(text);
     console.log(JSON.stringify(await send('comment',key,async(mark,save)=>{
      await editor.fill(text);if((await editor.innerText()).trim()!==text)throw new Error('评论草稿回读不一致');
      const buttons=card.getByRole('button',{name:'发布',exact:true});if(await buttons.count()!==1)throw new Error('评论发送入口不唯一');
      // Keep the site's optional cross-post switch off; one comment consumes one slot.
      const checked=card.locator('[role="checkbox"][aria-checked="true"],input[type="checkbox"]:checked');if(await checked.count())throw new Error('页面有额外发布选项已选中，需要核对');const cross=card.getByText('同时发布到想法',{exact:true});for(const option of await cross.all()){if(!await option.locator('..').locator('svg.ZDI--RadioButtonOff16').count())throw new Error('同时发布到想法选项并非明确关闭，未发送');}
      await buttons.click({trial:true});await check();mark();await buttons.click();
      await p.waitForFunction(({url,text})=>{const c=[...document.querySelectorAll('.ContentItem')].find(e=>[...e.querySelectorAll('meta[itemprop="url"]')].some(m=>m.content===url));return [...(c?.querySelectorAll('.CommentContent')||[])].some(e=>e.innerText.trim()===text);},{url:target.url,text},{timeout:15000});await check();
      const receipt=ownCommentReceipt(await visibleComments(card),rows.map(x=>x.id),text,config.account.profile);save('confirmed',{url:target.url,receipt});return {confirmed:true,url:target.url,receipt};
     })));
    }
   }
  }
 }
}catch(e){if(denied)atomicJSON(accessFile,{blocked:true,reason:'HTTP-403-or-timeout',operation:cmd,denials,at:new Date().toISOString()});console.log(JSON.stringify({confirmed:false,error:e.message,deliveryUncertain:dispatched}));process.exitCode=1;}
finally{clearTimeout(timer);budget?.finish();await b?.close();release?.();}
