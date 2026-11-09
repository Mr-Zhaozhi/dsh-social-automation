import {assertPlatformAvailable} from './lib/platform-holds.mjs';
assertPlatformAvailable('xiaohongshu');
import {xhsMessageRows} from './lib/xhs-incoming.mjs';
import {incomingOrNote} from './lib/incoming-media.mjs';
import {assertAutomaticInbox} from './lib/inbox-policy.mjs';
import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
import fs from 'node:fs';import path from 'node:path';
import {browser,workspace,atomicJSON,waitForLock} from './lib/runtime.mjs';import {socialBudget} from './lib/social-budget.mjs';
import {managedPage} from './lib/browser-pages.mjs';import {changedContacts,acceptContactSnapshot} from './lib/inbox-scan.mjs';
const args=process.argv.slice(2),cmd=args[0],opt=k=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:'';
try{assertAutomaticInbox();}catch(e){console.log(JSON.stringify({error:e.message,code:e.code,confirmed:false,deliveryUncertain:false}));process.exit(1);}
if(!['contacts','scan','read','observe','send','share'].includes(cmd))throw new Error('用法: contacts | scan | read --uid ID | send --uid ID --text 正文 --confirm [--reply-to 消息ID] | share --uid ID --url 笔记链接 --text 一句话 --confirm');
const uid=opt('uid');if(!['contacts','scan'].includes(cmd)&&!/^[a-f0-9]{24}$/.test(uid))throw new Error('需要从联系人列表或作者主页核对的完整用户ID');
const ledger=path.join(workspace,'.state/xhs-messages.json'),rows=()=>fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger)):[];
const release=await waitForLock('browser-actions');let b,p,outboundDispatched=false;
const readMessages=p=>p.locator('.xhs-im-chat-window .chat-item[data-message-id]').evaluateAll(xhsMessageRows);
try{
 await assertBrowserAvailable();b=await browser();p=await managedPage(b.contexts()[0],'xhs-inbox');
 let navigated=false;if(!await p.locator('.xhs-im-conv-item').count()){await p.goto('https://www.xiaohongshu.com/chat'+(uid?'?openUid='+uid:''),{waitUntil:'domcontentloaded'});navigated=true;}
 await p.locator('.xhs-im-conv-item').first().waitFor({timeout:20000});
 if(cmd==='contacts')console.log(JSON.stringify(await p.locator('.xhs-im-conv-item[data-conv-kind="c2c"]').evaluateAll(es=>es.map(e=>({uid:e.dataset.convId,name:e.querySelector('.xhs-im-conv-item__name')?.textContent,unread:!!e.querySelector('[class*=unread]')})))));
 else if(cmd==='scan'){
  const contacts=await p.locator('.xhs-im-conv-item[data-conv-kind="c2c"]').evaluateAll(es=>es.map(e=>({uid:e.dataset.convId,name:e.querySelector('.xhs-im-conv-item__name')?.textContent,preview:e.querySelector('.xhs-im-conv-item__summary-text')?.textContent||'',time:e.querySelector('.xhs-im-conv-item__time')?.textContent||'',unread:!!e.querySelector('[class*=unread],[class*=badge]')})));
  const scanFile=path.join(workspace,'.state/xhs-inbox-scan.json'),scan=fs.existsSync(scanFile)?JSON.parse(fs.readFileSync(scanFile)):{};
  if(scan.version!==2){for(const [id,value] of Object.entries(scan.contacts||{})){try{scan.contacts[id]=JSON.stringify([JSON.parse(value)[0],'']);}catch{}}scan.version=2;}
  const active=await p.locator('.xhs-im-conv-item--active').getAttribute('data-conv-id').catch(()=>null);
  const current=contacts.find(c=>c.uid===active);if(current)current.messageId=(await readMessages(p)).at(-1)?.id||'';
  const selected=changedContacts(scan,contacts).slice(0,5);
  const conversations=[];
  for(const c of selected){
   if((await p.locator('.xhs-im-input-bar-editor').innerText().catch(()=>'' )).trim())throw new Error('私信页已有草稿，暂不切换会话');
   if(active!==c.uid)await p.locator('.xhs-im-conv-item[data-conv-id="'+c.uid+'"]').click();
   await p.waitForFunction(name=>document.querySelector('.xhs-im-chat-window__header-name')?.textContent?.trim()===name,c.name.trim(),{timeout:8000});
   await p.locator('.xhs-im-chat-window .chat-item[data-message-id]').first().waitFor({timeout:8000}).catch(()=>{});
   const messages=(await readMessages(p)).slice(-12);if(messages.some(m=>!m.id.includes(c.uid)))throw new Error('会话消息尚未切换到目标对象');conversations.push({...c,messages});
  }
  acceptContactSnapshot(scan,contacts,selected.map(c=>c.uid));Object.assign(scan,{lastScan:new Date().toISOString(),listed:contacts.length,opened:selected.length,navigated});atomicJSON(scanFile,scan);
  console.log(JSON.stringify(conversations));
 }
 else{
  const item=p.locator('.xhs-im-conv-item[data-conv-id="'+uid+'"][data-conv-kind="c2c"]');if(await item.count()!==1)throw new Error('没有唯一的已核对私聊对象');await item.click();
  const name=(await item.locator('.xhs-im-conv-item__name').innerText()).trim(),header=p.locator('.xhs-im-chat-window__header-name');await header.waitFor();
  const verify=async()=>{if(await p.locator('.xhs-im-conv-item--active').getAttribute('data-conv-id')!==uid||(await header.innerText()).trim()!==name)throw new Error('收件人已变化');};await verify();
  const before=await readMessages(p);
  if(cmd==='observe'){const message=before.find(m=>m.id===opt('message-id'));if(!message||message.mine||!message.sharedUrl)throw new Error('没有核实收到的作品链接');const media=await incomingOrNote({platform:'xiaohongshu',eventId:message.id,peer:uid,kind:'private-share',url:message.sharedUrl,lockHeld:true});await verify();const after=(await readMessages(p)).find(m=>m.id===message.id);if(after?.sharedUrl!==message.sharedUrl)throw new Error('分享消息已变化');console.log(JSON.stringify(media));}
  else if(cmd==='read')console.log(JSON.stringify({uid,name,messages:before.slice(-12)}));
  else{
   if(!args.includes('--confirm'))throw new Error('发送需要 --confirm');let text=opt('text');
   if(cmd==='share'){const url=new URL(opt('url'));if(url.protocol!=='https:'||url.hostname!=='www.xiaohongshu.com'||!/^\/(explore|user\/profile)\//.test(url.pathname))throw new Error('分享只接受完整小红书笔记链接');text=(text||'这条分享给你。')+'\n'+url.href;}
   if(!text||[...text].length>1000)throw new Error('私信须为1至1000字');
   if(rows().some(r=>r.uid===uid&&r.text===text&&r.status!=='not-sent')||before.some(m=>m.mine&&m.text===text))throw new Error('相同内容已发送或待核查，未重发');
   const lastOutgoing=before.findLastIndex(m=>m.mine),lastIncoming=before.findLastIndex(m=>!m.mine);
   const checkReply=async()=>{if(!opt('reply-to'))return;const messages=await readMessages(p),last=messages.at(-1);if(!last||last.mine||last.id!==opt('reply-to'))throw Object.assign(new Error('对方消息已变化或已有回复，等待重新扫描'),{beforeDelivery:true});};await checkReply();
   if(lastOutgoing>=0&&lastIncoming<lastOutgoing&&await p.getByText(/对方关注或回复你之前/).count())throw new Error('对方尚未回复且平台限制陌生人消息，停止追发');
   const editor=p.locator('.xhs-im-input-bar-editor');if((await editor.innerText()).trim())throw new Error('当前输入框有草稿');
   let dispatch=false,entry={uid,name,text,kind:cmd,status:'pending',at:new Date().toISOString()};const save=()=>{const v=rows(),old=v.find(r=>r.uid===uid&&r.at===entry.at);if(old)Object.assign(old,entry);else v.push(entry);atomicJSON(ledger,v);};
   const result=await socialBudget.run('xiaohongshu','private',uid,async()=>{
    try{
     await editor.click();await editor.fill(text);await verify();if((await editor.innerText()).trim()!==text.trim())throw new Error('输入回读不一致');
     await checkReply();assertAutomaticInbox();save();dispatch=true;outboundDispatched=true;await editor.press('Enter');
     await p.waitForFunction(text=>[...document.querySelectorAll('.xhs-im-chat-window .chat-item__bubble--me .xhs-im-bubble__text')].some(e=>e.textContent===text),text,{timeout:12000});
     await p.reload({waitUntil:'domcontentloaded'});await p.locator('.xhs-im-chat-window .chat-item__bubble--me').first().waitFor({timeout:15000});await verify();
     const fresh=(await readMessages(p)).filter(m=>m.mine&&m.text===text&&!m.failed&&!before.some(old=>old.id===m.id));if(fresh.length!==1)throw new Error('没有唯一的新发送回执');
     entry.status='confirmed';entry.messageId=fresh[0].id;save();return {confirmed:true,uid,name,kind:cmd,messageId:entry.messageId};
    }catch(e){if(!dispatch&&e.code==='INBOX_RESTING')try{if((await editor.innerText()).trim()===text.trim()){await editor.press('ControlOrMeta+A');if((await editor.innerText()).trim()===text.trim())await editor.press('Backspace');}}catch{};entry.status=dispatch?'unknown':'not-sent';save();e.beforeDelivery=!dispatch;throw e;}
   });console.log(JSON.stringify(result));
  }
 }
}catch(e){console.log(JSON.stringify({error:String(e.message).slice(-500),code:e.code,confirmed:false,deliveryUncertain:outboundDispatched}));process.exitCode=1;}finally{await b?.close();release();}
