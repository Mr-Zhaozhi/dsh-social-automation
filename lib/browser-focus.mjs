import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
let cached;
// CDP focus emulation can report all tabs focused. Query the macOS front app
// without Accessibility permission; unavailable/ambiguous results stay unknown.
export async function nativeBrowserForeground({platform=process.platform,run=execute}={}){
 if(platform!=='darwin')return null;
 try{
  const front=(await run('/usr/bin/lsappinfo',['front'],{timeout:2000})).stdout.trim();
  if(!/^ASN:0x[0-9a-f]+-0x[0-9a-f]+:$/i.test(front))return null;
  const info=(await run('/usr/bin/lsappinfo',['info','-only','bundleid',front],{timeout:2000})).stdout;
  const id=info.match(/"CFBundleIdentifier"\s*=\s*"([A-Za-z0-9.-]+)"/)?.[1];
  return id ? /^com\.microsoft\.edgemac(?:\.|$)/i.test(id) : null;
 }catch{return null;}
}
export async function dedicatedBrowserForeground(){
 if(!cached||Date.now()-cached.at>1000)cached={at:Date.now(),value:nativeBrowserForeground()};
 return cached.value;
}
export async function managedChatInteraction(page){
 return page.evaluate(()=>{
  if(!/^deepseek-douyin-(?:api|dsh)-chat$/.test(window.name))return null;
  if(!window.__huohuoChatActivity){
   const state=window.__huohuoChatActivity={at:Date.now()};
   for(const event of ['keydown','pointerdown','wheel'])addEventListener(event,e=>{if(e.isTrusted)state.at=Date.now();},{capture:true,passive:true});
  }
  const editor=document.querySelector('[data-e2e="im-dialog"] [contenteditable=true]');
  const draft=editor?.innerText?.replace(/[\u200B-\u200F\uFEFF]/g,'').trim();
  return !!draft||Date.now()-window.__huohuoChatActivity.at<10000;
 }).catch(()=>null);
}
