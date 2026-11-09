import {assertAutomaticInbox} from './lib/inbox-policy.mjs';
import fs from 'node:fs';import path from 'node:path';
import {browser,workspace,atomicJSON,waitForLock} from './lib/runtime.mjs';
import {managedPage,closeTemporary} from './lib/browser-pages.mjs';import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
import {assertRunner,assertWatcher} from './lib/fleet.mjs';import {beginWatch} from './lib/watch-budget.mjs';import {socialBudget} from './lib/social-budget.mjs';
import {zhihuURL,textKey,accessProblem,assertMaySend,assertRecoveryPage} from './lib/zhihu-state.mjs';
const args=process.argv.slice(2),cmd=args[0],opt=n=>args.includes('--'+n)?args[args.indexOf('--'+n)+1]:'';
try{assertAutomaticInbox();}catch(e){console.log(JSON.stringify({error:e.message,code:e.code,confirmed:false,deliveryUncertain:false}));process.exit(1);}
const settings=JSON.parse(fs.readFileSync(path.join(workspace,'zhihu.json'))),accessFile=path.join(workspace,'.state/zhihu-access.json'),ledgerFile=path.join(workspace,'.state/zhihu-deliveries.json');
const load=(p,f)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):f;
if(settings.mode==='home'&&['status','browse','read','like','comment','reply','comments'].includes(cmd)){await import('./zhihu-home.mjs');process.exit(process.exitCode||0);}
if(!['status','browse','search','read','like','comment','reply','answer','share','notifications','reply-context'].includes(cmd))throw new Error('用法 status [--resume] | browse [--screens 3] | search --query 关键词 | read/like/comment/reply/answer/share --url 链接 [--text 正文 --confirm] | notifications');
let b,p,budget,timer,release,dispatched=false;
async function checkAccess(){
 const problem=accessProblem((await p.locator('body').innerText()).slice(0,15000),p.url());
 if(problem){atomicJSON(accessFile,{blocked:true,reason:problem,at:new Date().toISOString()});throw new Error('知乎 '+problem+'，已暂停，请本人处理后运行 status --resume');}
}
async function identity(){
 await checkAccess();const avatar=p.locator('.AppHeader-profileEntry');
 if(await avatar.count()!==1)throw new Error('无法唯一核对知乎登录账号');
 const alt=await avatar.locator('img').getAttribute('alt');
 if(!alt?.includes(settings.account.name))throw new Error('知乎登录账号与授权账号不一致');
 await avatar.click();const profile=await p.getByRole('link',{name:'我的主页',exact:true}).getAttribute('href');await avatar.click();
 if(new URL(profile,'https://www.zhihu.com').href!==settings.account.profile)throw new Error('知乎账号主页身份不一致');
 return settings.account;
}
async function protectDraft(){
 for(const box of await p.locator('textarea:visible,[contenteditable="true"]:visible').all()){
  const value=await box.evaluate(e=>'value' in e?e.value:e.innerText);
  if(value.trim())throw new Error('知乎页面有未发送草稿，未覆盖或离开');
 }
}
async function go(url){await protectDraft();if(p.url()!==url)await p.goto(url,{waitUntil:'domcontentloaded',timeout:25000});await checkAccess();}
async function rows(){return p.locator('a[href*="/question/"]:visible').evaluateAll(es=>[...new Map(es.map(e=>[e.href,{url:e.href,title:e.innerText.trim()}])).values()].filter(x=>x.title).slice(0,30));}
async function answerRoot(target){
 const root=p.locator('.AnswerItem').filter({has:p.locator(`meta[itemprop="url"][content$="/answer/${target.answerId}"]`)});
 if(await root.count()===1)return root;
 const single=p.locator('.AnswerItem:visible');if(await single.count()===1&&new URL(p.url()).pathname.endsWith('/answer/'+target.answerId))return single;
 throw new Error('无法唯一核对目标回答，未操作');
}
async function readAnswer(target){
 await go(target.url);await identity();const root=await answerRoot(target);
 const expand=root.getByRole('button',{name:/阅读全文|展开阅读全文/});if(await expand.count()===1)await expand.click();
 const content=root.locator('.RichText');if(!await content.count())throw new Error('没有实际回答正文');
 return {url:target.url,title:await p.locator('h1').first().innerText(),text:(await content.allTextContents()).join('\n').slice(0,15000)};
}
async function transact(kind,key,fn){
 if(!args.includes('--confirm'))throw new Error('写操作需要 --confirm');
 const ledger=load(ledgerFile,{});assertMaySend(ledger,key);await assertRunner();
 const save=(status,extra={})=>{ledger[key]={status,at:new Date().toISOString(),...extra};atomicJSON(ledgerFile,ledger);};
 const action=async()=>{try{return await fn(()=>{assertAutomaticInbox();save('pending');dispatched=true;},save);}catch(e){save(dispatched?'unknown':'not-sent',{error:e.message});e.beforeDelivery=!dispatched;throw e;}};
 return kind?socialBudget.run('zhihu',kind,key,action):action();
}
try{
 if(cmd!=='status'&&load(accessFile,{}).blocked)throw new Error('知乎访问已暂停，等待本人恢复；未自动重试');
 await assertRunner();await assertBrowserAvailable();release=await waitForLock('browser-actions');b=await browser();
 p=await managedPage(b.contexts()[0],cmd==='notifications'?'zhihu-inbox':'zhihu-browse');
 if(cmd==='status'){
  if(!p.url().includes('zhihu.com'))await p.goto('https://www.zhihu.com/',{waitUntil:'domcontentloaded'});
  const account=await identity();if(args.includes('--resume')){assertRecoveryPage(load(accessFile,{}),{url:p.url(),answerCount:await p.locator('.AnswerItem:visible .RichText:visible').count()});atomicJSON(accessFile,{blocked:false,at:new Date().toISOString()});}console.log(JSON.stringify({loggedIn:true,account,blocked:load(accessFile,{}).blocked===true}));
 }else if(['browse','search'].includes(cmd)){
  await assertWatcher('zhihu');budget=beginWatch({platform:'zhihu',maxSeconds:90});timer=setTimeout(()=>void p.close().catch(()=>{}),budget.allowedMs);
  await go('https://www.zhihu.com/');await identity();
  if(cmd==='search'){const q=opt('query');if(!q||q.length>60)throw new Error('需要1至60字关键词');await p.getByRole('combobox').fill(q);await p.getByRole('combobox').press('Enter');await p.waitForURL('**/search?**');await checkAccess();await p.locator('a[href*="/question/"]:visible').first().waitFor({timeout:20000});}
  const screens=Math.max(1,Math.min(5,Number(opt('screens')||3))),steps=[];
  for(let i=0;i<screens;i++){
   const visible=await p.locator('a[href*="/question/"]').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.top>=0&&r.top<innerHeight;}).map(e=>({url:e.href,title:e.innerText})).filter(x=>x.title));steps.push(visible);
   if(i+1<screens){const before=await p.evaluate(()=>scrollY);await p.mouse.move(600,600);await p.mouse.wheel(0,650);await p.waitForFunction(y=>Math.abs(scrollY-y)>100,before,{timeout:6000});await checkAccess();}
  }
  const result={screens:steps,items:await rows(),at:new Date().toISOString()};atomicJSON(path.join(workspace,'.state/zhihu-browse.json'),result);console.log(JSON.stringify(result));
 }else if(cmd==='notifications'){
  await go('https://www.zhihu.com/notifications');await identity();
  const items=await p.locator('main a[href*="/question/"]').evaluateAll(es=>es.map(e=>({url:e.href,text:e.closest('article,li,[data-za-detail-view-id]')?.innerText||e.parentElement.innerText})).filter(x=>x.text));
  const rows=items.map(r=>({...r,key:textKey(r.url+'\n'+r.text.replace(/\d+\s*(秒|分钟|小时|天)前/g,'')),replyable:/回复了你|回复了你的评论|评论了你的回答/.test(r.text)}));console.log(JSON.stringify(rows));
 }else{
  const target=zhihuURL(opt('url')),text=opt('text').trim();
  if(cmd==='read'){if(!target.answerId)throw new Error('read 需要完整回答链接');await assertWatcher('zhihu');budget=beginWatch({platform:'zhihu',maxSeconds:90});timer=setTimeout(()=>void p.close().catch(()=>{}),budget.allowedMs);console.log(JSON.stringify(await readAnswer(target)));}
  else if(cmd==='reply-context'){
   const u=new URL(opt('url')),id=u.searchParams.get('commentId')||u.hash.match(/comment[-_](\d+)/)?.[1];
   if(!target.answerId||!id||!/^\d+$/.test(id))throw new Error('通知缺少可核对的原评论编号，保留待核查');
   await readAnswer(target);const root=await answerRoot(target);const entry=root.getByRole('button',{name:/条评论|添加评论/});if(await entry.count()!==1)throw new Error('评论入口不唯一');await entry.click();
   const row=p.locator(`[data-comment-id="${id}"],[data-id="${id}"],#comment-${id}`);if(await row.count()!==1)throw new Error('没有唯一的通知目标评论');
   const author=row.locator('a[href*="/people/"]').first(),content=row.locator('.RichText,.CommentItemV2-content').first();
   if(!await author.count()||!await content.count())throw new Error('无法核对评论作者与正文');
   const quote=await content.innerText(),name=await author.innerText();
   if(name===settings.account.name||!(await row.innerText()).includes(settings.account.name))throw new Error('不能确认这条评论在回复本人');
   console.log(JSON.stringify({url:target.url,commentId:id,author:name,quote}));
  }
  else if(cmd==='like'){
   if(!target.answerId)throw new Error('需要回答链接');await readAnswer(target);const root=await answerRoot(target),button=root.locator('button.VoteButton--up');
   if(await button.count()!==1)throw new Error('赞同控件不唯一');
   const active=()=>button.evaluate(e=>e.classList.contains('is-active')||e.getAttribute('aria-pressed')==='true');
   if(await active())console.log(JSON.stringify({confirmed:true,alreadyLiked:true}));
   else console.log(JSON.stringify(await transact(null,'like:'+target.answerId,async(mark,save)=>{await button.click({trial:true});mark();await button.click();await p.waitForFunction(id=>{const es=[...document.querySelectorAll('.AnswerItem')];return es.some(e=>e.querySelector(`meta[itemprop="url"][content$="/answer/${id}"]`)&&e.querySelector('.VoteButton--up.is-active'));},target.answerId,{timeout:10000});if(!await active())throw new Error('赞同未确认');save('confirmed',{url:target.url});return {confirmed:true,url:target.url};})));
  }else if(['comment','reply'].includes(cmd)){
   if(!target.answerId||text.length<2||text.length>500)throw new Error('评论需要回答链接及2至500字正文');await readAnswer(target);const root=await answerRoot(target);
   const comments=root.getByRole('button',{name:/^(?:​)?\s*(?:\d+ 条评论|添加评论|评论)/});if(await comments.count()!==1)throw new Error('评论入口不唯一');await comments.click();
   const panel=p.locator('.Comments-container:visible,.CommentsV2:visible');if(await panel.count()!==1)throw new Error('评论面板不唯一');
   if(cmd==='reply'){
    const quote=opt('quote'),author=opt('author');if(!quote||!author)throw new Error('回复必须包含原文与作者');
    const row=panel.locator('.CommentItemV2,.CommentItem').filter({hasText:quote}).filter({hasText:author});if(await row.count()!==1)throw new Error('目标评论不唯一');await row.getByRole('button',{name:'回复',exact:true}).click();
   }
   const editor=panel.locator('[contenteditable="true"]:visible,textarea:visible');if(await editor.count()!==1)throw new Error('评论输入框不唯一');
   const old=await editor.evaluate(e=>'value' in e?e.value:e.innerText);if(old.trim())throw new Error('评论已有草稿');
   console.log(JSON.stringify(await transact('comment',cmd+':'+target.answerId+':'+textKey(opt('quote')+'\n'+text),async(mark,save)=>{
    await editor.fill(text);const read=await editor.evaluate(e=>'value' in e?e.value:e.innerText);if(read.trim()!==text)throw new Error('评论草稿回读不一致');
    const send=panel.getByRole('button',{name:/^(发布|发送|评论)$/});if(await send.count()!==1)throw new Error('评论发送按钮不唯一');await send.click({trial:true});await identity();mark();await send.click();
    const own=panel.locator('.CommentItemV2,.CommentItem').filter({hasText:text}).filter({hasText:settings.account.name});await own.waitFor({timeout:15000});if(await own.count()!==1)throw new Error('新评论回执不唯一');
    const receipt=await own.evaluate(e=>({id:e.getAttribute('data-comment-id')||e.id||e.getAttribute('data-id'),text:e.innerText}));if(!receipt.id)throw new Error('新评论缺少稳定编号，需要人工核对');save('confirmed',{url:target.url,receipt});return {confirmed:true,receipt};
   })));
  }else if(cmd==='answer'){
   if(target.answerId||text.length<100||text.length>5000)throw new Error('回答需要问题链接及100至5000字正文');await go(target.url);await identity();
   const write=p.getByRole('button',{name:'写回答',exact:true});if(await write.count()!==1)throw new Error('写回答入口不唯一');await write.click();
   const editor=p.locator('[contenteditable="true"]:visible');if(await editor.count()!==1||!!(await editor.innerText()).trim())throw new Error('回答编辑器不唯一或已有草稿');
   console.log(JSON.stringify(await transact('post','answer:'+target.questionId,async(mark,save)=>{
    const content=text+'\n\n（AI 助手整理）';await editor.fill(content);if((await editor.innerText()).trim()!==content)throw new Error('回答草稿回读不一致');
    const send=p.getByRole('button',{name:'发布回答',exact:true});await send.click({trial:true});await identity();mark();await send.click();
    await p.waitForURL(new RegExp('/question/'+target.questionId+'/answer/\\d+'),{timeout:20000});const receipt=zhihuURL(p.url());
    const own=await answerRoot(receipt);if(!(await own.innerText()).includes(text.slice(0,80)))throw new Error('回答正文未确认');save('confirmed',{url:receipt.url});return {confirmed:true,url:receipt.url};
   })));
  }else if(cmd==='share'){
   if(!target.answerId||text.length<3||text.length>300)throw new Error('分享需要完整回答链接和3至300字推荐语');await readAnswer(target);
   const content=text+'\n'+target.url+'\n（AI 助手分享）';await go('https://www.zhihu.com/');await identity();
   const editor=p.locator('[contenteditable="true"]:visible,textarea:visible');
   if(await editor.count()!==1)throw new Error('想法编辑器不唯一，未分享');
   const old=await editor.evaluate(e=>'value' in e?e.value:e.innerText);if(old.trim())throw new Error('想法已有草稿');
   console.log(JSON.stringify(await transact('post','share:'+target.answerId,async(mark,save)=>{
    await editor.fill(content);if((await editor.evaluate(e=>'value' in e?e.value:e.innerText)).trim()!==content)throw new Error('分享草稿回读不一致');
    const send=p.getByRole('button',{name:'发想法',exact:true});if(await send.count()!==1)throw new Error('发布想法按钮不唯一');await send.click({trial:true});await identity();mark();await send.click();
    await p.waitForFunction(()=>[...document.querySelectorAll('[contenteditable="true"],textarea')].filter(e=>e.getBoundingClientRect().width).every(e=>!('value' in e?e.value:e.innerText).trim()),null,{timeout:15000});
    await go(settings.account.profile);const tab=p.getByRole('link',{name:/^想法(?:\s*\d+)?$/});if(await tab.count()!==1)throw new Error('想法已提交，未能核对个人主页回执');await tab.click();
    const pin=p.locator('article,.PinItem').filter({hasText:text});await pin.waitFor({timeout:15000});if(await pin.count()!==1||!await pin.locator(`a[href="${target.url}"]`).count())throw new Error('分享正文或原回答链接未确认');
    const link=pin.locator('a[href*="/pin/"]');const urls=[...new Set(await link.evaluateAll(es=>es.map(e=>e.href)))];if(urls.length!==1)throw new Error('分享已提交，未取得唯一想法编号');save('confirmed',{url:urls[0],source:target.url});return {confirmed:true,url:urls[0],source:target.url};
   })));

  }
 }
}catch(e){console.log(JSON.stringify({error:e.message,code:e.code,confirmed:false,deliveryUncertain:dispatched}));process.exitCode=1;}
finally{clearTimeout(timer);budget?.finish();await closeTemporary(p);await b?.close();release?.();}
