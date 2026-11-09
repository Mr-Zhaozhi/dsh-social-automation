// Quiet hours stop scheduled scans, not replies to observed incoming events.
import {AsyncLocalStorage} from 'node:async_hooks';
import {inboxStatus} from './inbox-policy.mjs';
// Versioned hot reloads share one context; duplicate module URLs must not split grants.
const key=Symbol.for('huohuo.passive-inbox:'+new URL('.',import.meta.url).href);
const {scope,wakes}=globalThis[key]??=( {scope:new AsyncLocalStorage(),wakes:new WeakMap()} );
export const passiveRecipient=()=>scope.getStore()?.recipientId;
export function passiveAccess(platform,{now=Date.now()}={}){const s=scope.getStore();return platform==='douyin'&&s?.expiresAt>now;}
export function passiveEnabled(options){const s=inboxStatus('douyin',options);return s.allowed||s.reason==='quiet-hours';}
export function noteIncoming(service,id,{now=Date.now()}={}){
 if(!passiveEnabled({now})||!service.running||service.abort?.signal.aborted||!service.policy?.allowlist.some(c=>c.id===id))return false;
 let q=wakes.get(service);if(!q)wakes.set(service,q=new Map());
 q.set(id,{recipientId:id,expiresAt:now+360000,nextAt:now,attempts:0});return true;
}
function due(service,now=Date.now()){
 const q=wakes.get(service);if(!q)return;
 for(const[id,g]of q){if(g.expiresAt<=now||g.attempts>=3||!service.policy?.allowlist.some(c=>c.id===id))q.delete(id);else if(g.nextAt<=now)return g;}
}
export function chatCanPoll(service){const s=inboxStatus('douyin');return s.allowed||s.reason==='quiet-hours'&&Boolean(due(service));}
export function clearPassive(service){wakes.delete(service);}
export async function runInboxPoll(service,run){
 const s=inboxStatus('douyin');if(s.allowed){wakes.delete(service);return run();}
 if(s.reason!=='quiet-hours')return;
 const g=due(service);if(!g)return;
 if(service.busy){service.pollRequested=true;return;}
 g.attempts++;g.nextAt=Date.now()+10000;
 return scope.run({...g},async()=>{try{return await run();}finally{
  // Failed/foreground reads get bounded retries. A completed read consumes the wake.
  const checked=Date.parse(service.watermarks?.contacts?.[g.recipientId]?.lastCheckedAt)||0;
  if(checked>=g.nextAt-10000&&wakes.get(service)?.get(g.recipientId)===g)wakes.get(service).delete(g.recipientId);
 }});
}
