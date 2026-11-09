import {assertPlatformAvailable} from './lib/platform-holds.mjs';
assertPlatformAvailable('xiaohongshu');
import {incomingOrNote} from './lib/incoming-media.mjs';
import {assertAutomaticInbox} from './lib/inbox-policy.mjs';
import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {browser,workspace,waitForLock,atomicJSON} from './lib/runtime.mjs';import {managedPage,closeTemporary} from './lib/browser-pages.mjs';import {socialBudget} from './lib/social-budget.mjs';
const args=process.argv.slice(2),cmd=args[0],opt=k=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:'';
try{assertAutomaticInbox();}catch(e){console.log(JSON.stringify({error:e.message,code:e.code,confirmed:false,deliveryUncertain:false}));process.exit(1);}
if(!['scan','prepare','reply'].includes(cmd))throw new Error('用法 scan | reply --key 通知编号 --text 正文 --confirm');
// Emoji alt text can disappear after client hydration. It must not change event identity.
const stable=t=>String(t||'').replace(/\[[^\]]{1,20}\]/g,'').replace(/\s/g,'');
const fingerprint=r=>createHash('sha256').update(JSON.stringify([r.uid,r.hint,stable(r.text),stable(r.quote),r.image])).digest('hex');
async function read(p){return (await p.locator('.info').filter({has:p.locator('.interaction-content')}).evaluateAll(es=>es.map((e,index)=>({index,uid:e.querySelector('.user-info a')?.getAttribute('href')?.match(/profile\/([a-f0-9]{24})/)?.[1],name:e.querySelector('.user-info a')?.textContent?.trim(),hint:e.querySelector('.interaction-hint span')?.textContent,time:e.querySelector('.interaction-time')?.textContent?.trim(),text:e.querySelector('.interaction-content')?.textContent?.trim(),quote:e.querySelector('.quote-info')?.textContent?.trim()||'',image:e.parentElement.querySelector('.extra-image')?.getAttribute('src')?.split('?')[0]||'',replyable:!!e.querySelector('.action-reply,textarea.comment-input')})))).filter(r=>r.uid&&r.replyable).map(r=>({...r,key:fingerprint(r)}));}
const release=await waitForLock('browser-actions'),file=path.join(workspace,'.state/xhs-comment-replies.json'),ledger=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};let b,p,outboundDispatched=false;
try{
 await assertBrowserAvailable();b=await browser();p=await managedPage(b.contexts()[0],'xhs-notifications');await p.goto('https://www.xiaohongshu.com/notification',{waitUntil:'domcontentloaded'});await p.locator('.interaction-content').first().waitFor({timeout:18000});
 const rows=await read(p);
 if(cmd==='scan')console.log(JSON.stringify(rows.map(({image,index,...r})=>r)));
 else{
  const match=rows.filter(r=>r.key===opt('key'));if(match.length!==1)throw new Error('通知不存在或不唯一');const row=match[0],text=opt('text');if(cmd==='reply'&&(!args.includes('--confirm')||!text||[...text].length>180))throw new Error('需要正文和 --confirm');
  if(cmd==='reply'&&ledger()[row.key]&&ledger()[row.key].status!=='not-sent')throw new Error('这条通知已处理或结果待核查，不重发');
  const info=p.locator('.info').filter({has:p.locator('.interaction-content')}).nth(row.index),main=info.locator('..');
  if(cmd==='prepare'){await main.locator('.extra-image').click();await p.locator('.note-container').waitFor({timeout:15000});const media=await incomingOrNote({platform:'xiaohongshu',eventId:row.key,peer:row.uid,kind:/提到|@/.test(row.hint)?'comment-mention':'comment-reply',url:p.url(),page:p});console.log(JSON.stringify(media));}
  else{
  await info.locator('.action-reply').click();const editor=info.locator('textarea.comment-input');if((await editor.inputValue()).trim())throw new Error('已有回复草稿');if(await editor.getAttribute('placeholder')!=='回复 '+row.name)throw new Error('回复对象不匹配');
  let dispatched=false;const save=(status,extra={})=>{const v=ledger();v[row.key]={status,name:row.name,text,at:new Date().toISOString(),...extra};atomicJSON(file,v);};
  const result=await socialBudget.run('xiaohongshu','comment',row.key,async()=>{
   try{await editor.fill(text);if((await read(p)).filter(r=>r.key===row.key).length!==1)throw new Error('通知已变化');assertAutomaticInbox();save('pending');dispatched=true;outboundDispatched=true;await info.getByRole('button',{name:'发送',exact:true}).click();
    await editor.waitFor({state:'hidden',timeout:12000});await main.locator('.extra-image').click();await p.locator('.note-container').waitFor({timeout:15000});
    await p.locator('.note-container .comment-item').first().waitFor({timeout:15000});
    const me=(await p.locator('a').filter({hasText:/^我$/}).first().getAttribute('href')).match(/profile\/([a-f0-9]{24})/)?.[1];if(!me)throw new Error('无法核对本人身份');
    const receipt=()=>p.locator('.note-container .comment-item').evaluateAll((es,{text,me})=>es.filter(e=>e.querySelector(':scope > .comment-inner-container > .right > .content')?.textContent?.trim()===text&&e.querySelector(':scope > .comment-inner-container .author a')?.getAttribute('data-user-id')===me).map(e=>e.id),{text,me});
    let ids=await receipt();for(let i=0;!ids.length&&i<5;i++){const more=p.getByText(/^展开 \d+ 条回复$/).filter({visible:true});if(!await more.count())break;await more.first().click();await p.waitForFunction(text=>[...document.querySelectorAll('.note-container .content')].some(e=>e.textContent.trim()===text),text,{timeout:2500}).catch(()=>{});ids=await receipt();}
    if(ids.length!==1)throw new Error('缺少唯一的本人评论回执');const commentId=ids[0];save('confirmed',{commentId});return {confirmed:true,key:row.key,commentId};
   }catch(e){save(dispatched?'unknown':'not-sent',{error:String(e.message).slice(-350)});e.beforeDelivery=!dispatched;throw e;}
  });console.log(JSON.stringify(result));
  }
 }
}catch(e){console.log(JSON.stringify({error:e.message,code:e.code,confirmed:false,deliveryUncertain:outboundDispatched}));process.exitCode=1;}finally{await closeTemporary(p);await b?.close();release();}
