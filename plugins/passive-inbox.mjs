import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {workspace,harness,atomicJSON} from '../lib/runtime.mjs';
import {passiveEnabled} from '../lib/passive-inbox.mjs';
export const name='huohuo-passive-inbox';
export async function apply(ctx){
 const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
 if(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version!=='1.4.6')throw Error('被动回复需复核插件版本');
 const load=(file,suffix)=>import(pathToFileURL(path.join(pkg,file)).href+suffix);
 const fresh=await load('chat-service.mjs','?huohuoPassive=16'),browser=await load('chat-browser.mjs','?huohuoPassive=16');
 const freshAgent=await load('chat-agent.mjs','?huohuoVideoAudio=16');
 const agentTypes=new Set();for(const suffix of ['', '?v=9'])agentTypes.add((await load('chat-agent.mjs',suffix)).ChatAgent);
 const core=fs.readFileSync(path.join(pkg,'core.mjs'),'utf8'),variants=new Set(['',...[...core.matchAll(/chat-service\.mjs(\?v=\d+)/g)].map(m=>m[1])]);
 const types=new Set(),browsers=new Set();for(const suffix of variants){types.add((await load('chat-service.mjs',suffix)).ChatService);browsers.add((await load('chat-browser.mjs',suffix)).ChatBrowser);}
 const status=path.join(workspace,'.state/passive-inbox-runtime.json'),initialized=new WeakSet(),saved=[];
 const replace=(proto,key,value)=>{const old=Object.getOwnPropertyDescriptor(proto,key);Object.defineProperty(proto,key,{value,writable:true,configurable:true});saved.push([proto,key,old,value]);};
 ctx.effect(()=>{
  for(const type of agentTypes)replace(type.prototype,'reply',freshAgent.ChatAgent.prototype.reply);
  for(const type of browsers)for(const key of ['subscribeIncoming','sendMessage'])replace(type.prototype,key,browser.ChatBrowser.prototype[key]);
  for(const type of types){
   for(const key of ['notifyIncoming','requestPoll','poll','pollInbox','startPolling','stopPolling','processAutoBacklog','observeMessage','deliverReply']){
    const method=fresh.ChatService.prototype[key];if(typeof method==='function')replace(type.prototype,key,method);
   }
   const original=type.prototype.state;
   replace(type.prototype,'state',function(){
    if(this.running&&!this.busy&&!initialized.has(this)){
     initialized.add(this);this.startPolling({immediate:false});
     atomicJSON(status,{loaded:true,implementation:16,at:new Date().toISOString(),pid:process.pid,subscription:'event-driven',baselinePreserved:true});
     // One explicit local repair request, never a standing periodic night scan.
     const file=path.join(workspace,'.state/passive-inbox-repair.json');
     if(fs.existsSync(file)){try{const r=JSON.parse(fs.readFileSync(file));if(r.expiresAt>Date.now()&&passiveEnabled()&&this.policy.allowlist.some(c=>c.id===r.recipientId)){fs.renameSync(file,file+'.consumed');this.notifyIncoming(r.recipientId);}}catch{}}
    }
    const state=original.call(this);return {...state,passiveInbox:{enabled:passiveEnabled(),nightMode:'incoming-events-only'}};
   });
  }
  atomicJSON(status,{loaded:true,implementation:16,at:new Date().toISOString(),pid:process.pid,variants:[...variants],awaitingService:true});
  return()=>{for(const[p,k,old,value]of saved.reverse())if(p[k]===value){if(old)Object.defineProperty(p,k,old);else delete p[k];}};
 });
}
