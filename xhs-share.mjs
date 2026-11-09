import {assertPlatformAvailable} from './lib/platform-holds.mjs';
assertPlatformAvailable('xiaohongshu');
import fs from 'node:fs';import path from 'node:path';
import {browser,workspace,atomicJSON,lock} from './lib/runtime.mjs';import {socialBudget} from './lib/social-budget.mjs';
import {assertRunner} from './lib/fleet.mjs';import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
await assertRunner();await assertBrowserAvailable();
import {managedPage,closeTemporary,backgroundPage} from './lib/browser-pages.mjs';
const args=process.argv.slice(2),opt=k=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:'';
const uid=opt('uid'),url=new URL(opt('url'));
if(!args.includes('--confirm')||!/^[a-f0-9]{24}$/.test(uid)||url.protocol!=='https:'||url.hostname!=='www.xiaohongshu.com'||!/^\/explore\/[a-f0-9]{24}$/.test(url.pathname))throw new Error('需要 --uid 联系人ID --url 笔记完整链接 --confirm');
const noteId=url.pathname.split('/').at(-1),file=path.join(workspace,'.state/xhs-messages.json'),read=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
if(read().some(r=>r.uid===uid&&r.noteId===noteId&&r.status!=='not-sent'))throw new Error('同一笔记已有发送记录，未重复分享');
const release=lock('browser-actions');let b,p,chat,timer;
try{
 b=await browser();const ctx=b.contexts()[0];chat=await backgroundPage(ctx);await chat.goto('https://www.xiaohongshu.com/chat?openUid='+uid,{waitUntil:'domcontentloaded'});
 const contact=chat.locator('.xhs-im-conv-item[data-conv-id="'+uid+'"][data-conv-kind="c2c"]');await contact.waitFor({timeout:20000});await contact.click();
 const name=(await contact.locator('.xhs-im-conv-item__name').innerText()).trim(),avatar=new URL(await contact.locator('img.xhs-im-conv-item__avatar').getAttribute('src')).pathname;
 const active=()=>chat.locator('.xhs-im-conv-item--active').getAttribute('data-conv-id');if(await active()!==uid)throw new Error('目标会话未选定');
 const before=new Set(await chat.locator('.chat-item[data-message-id]').evaluateAll(es=>es.map(e=>e.dataset.messageId)));
 if(args.includes('--adopt'))p=ctx.pages().find(p=>p.url().includes('/explore/'+noteId));
 if(!p){p=await managedPage(ctx,'xhs-interaction');await p.goto(url.href,{waitUntil:'domcontentloaded'});}
 timer=setTimeout(()=>void p?.close(),90000);
 await p.locator('#detail-desc').waitFor();const title=await p.locator('#detail-title').innerText();
 const dialog=p.locator('.xhs-note-forward-dialog');
 if(!await dialog.isVisible()){await p.locator('#noteContainer .share-wrapper').hover();await p.getByText('私信好友',{exact:true}).click();await dialog.waitFor({state:'visible'});}
 const row=dialog.locator('.xhs-im-forward-user-list-row').filter({has:p.getByText(name,{exact:true})});
 if(await row.count()!==1||new URL(await row.locator('img').getAttribute('src')).pathname!==avatar)throw new Error('分享列表中的姓名、头像与已核对会话不匹配，或平台不允许分享给此人');
 const selected=dialog.locator('.xhs-im-forward-user-list-item--selected');
 if(await selected.count()===0)await row.click();
 if(await selected.count()!==1||!await selected.getByText(name,{exact:true}).count())throw new Error('分享收件人不是唯一指定对象');
 const caption=opt('text');if(caption)await dialog.getByPlaceholder('跟朋友说点什么吧...').fill(caption);
 const entry={uid,name,noteId,title,kind:'native-card',status:'pending',at:new Date().toISOString()};
 const save=()=>{const rows=read(),old=rows.find(x=>x.uid===uid&&x.noteId===noteId);if(old)Object.assign(old,entry);else rows.push(entry);atomicJSON(file,rows);};
 const result=await socialBudget.run('xiaohongshu','private',uid,async()=>{
  save();await dialog.getByRole('button',{name:'发送',exact:true}).click({timeout:8000});
  await dialog.waitFor({state:'hidden',timeout:15000});
  await chat.reload({waitUntil:'domcontentloaded'});await chat.locator('.xhs-im-chat-window').waitFor();if(await active()!==uid)throw new Error('回执会话身份变化');
  const card=chat.locator('.chat-item[data-message-id]').filter({hasText:title}).filter({has:chat.locator('.chat-item__bubble--me')});await card.last().waitFor({timeout:15000});
  const fresh=(await card.evaluateAll(es=>es.map(e=>({id:e.dataset.messageId,text:e.innerText,html:e.outerHTML})))).filter(x=>!before.has(x.id)&&!x.html.includes('send-failed'));
  if(fresh.length!==1)throw new Error('分享回执不唯一');entry.status='confirmed';entry.messageId=fresh[0].id;save();return {confirmed:true,kind:'native-card',uid,name,noteId,messageId:entry.messageId};
 },[],caption?2:1);console.log(JSON.stringify(result));
}finally{clearTimeout(timer);try{await closeTemporary(p);await closeTemporary(chat);await b?.close();}finally{release();}}
