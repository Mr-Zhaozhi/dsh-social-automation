import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {browser,harness,workspace,atomicJSON} from '../lib/runtime.mjs';
import {readHost,eligibleHost,checkOwner,writeRecovery} from '../lib/browser-recovery.mjs';
export const name='huohuo-browser-recovery';
export function apply(ctx){
 let closed=false,busy=false,connection,guard,host,nextAt=0;
 const status=path.join(workspace,'.state/browser-recovery.json');
 const report=(state,error)=>atomicJSON(status,{at:new Date().toISOString(),state,error:error?.message?.slice(0,200),pid:process.pid,preservedPages:true});
 const disconnect=async()=>{const g=guard,b=connection;guard=null;connection=null;await g?.close().catch(()=>{});await b?.close().catch(()=>{});};
 const fail=error=>{try{if(host)writeRecovery(host,false,error);}catch{}report('blocked',error);nextAt=Date.now()+5*60000;void disconnect();};
 const tick=async()=>{
  if(closed||busy||Date.now()<nextAt)return;
  if(guard){try{guard.assertHealthy();}catch(e){fail(e);}return;}
  busy=true;
  try{
   const state=readHost();if(process.platform!=='darwin'||!eligibleHost(state))return;
   await checkOwner(state);host=state;report('reconnecting');
   const b=await browser();if(closed){await b.close();return;}connection=b;
   const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
   const {installNativeFocusReset}=await import(pathToFileURL(path.join(pkg,'browser-host.mjs')).href);
   const g=await installNativeFocusReset(b.contexts()[0],{timeoutMs:10000,onFailure:fail});
   if(closed){await g.close();await disconnect();return;}guard=g;g.assertHealthy();
   await checkOwner(state);writeRecovery(state,true);report('ready');
   b.on('disconnected',()=>{if(!closed&&connection===b)fail(Error('浏览器连接已断开，保留页面等待恢复'));});
  }catch(e){fail(e);}finally{busy=false;}
 };
 ctx.effect(()=>{const t=setInterval(()=>void tick(),60000);void tick();return()=>{closed=true;clearInterval(t);try{if(guard&&host)writeRecovery(host,false,'恢复守护已卸载');}catch{}void disconnect();};});
}
