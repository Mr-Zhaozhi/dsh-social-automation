import {sharedContext as memory1Context} from '../lib/shared-context.mjs?v=memory1';
import {sharedContext as life1Context} from '../lib/shared-context.mjs?v=life1';
import {sharedContext as life2Context} from '../lib/shared-context.mjs?v=life2';
import {sharedContext as cachedContext} from '../lib/shared-context.mjs';
import fs from 'node:fs';import path from 'node:path';
import {sharedContext,renderSharedContext} from '../lib/shared-context.mjs?v=memory2';
import {workspace,atomicJSON} from '../lib/runtime.mjs';
import {TurnContextSnapshots} from '../lib/turn-context.mjs';
export const name='huohuo-shared-context';
export function apply(ctx){
 const newPrototype=Object.getPrototypeOf(sharedContext);
 // Update every previously loaded context singleton used by social adapters.
 ctx.effect(()=>{const changed=[...new Set([cachedContext,life1Context,life2Context,memory1Context])].map(instance=>[instance,Object.getPrototypeOf(instance)]);for(const [instance]of changed)Object.setPrototypeOf(instance,newPrototype);return()=>{for(const [instance,old]of changed)if(Object.getPrototypeOf(instance)===newPrototype)Object.setPrototypeOf(instance,old);};});
 const disposers=[];const attached=new Set(),snapshots=new TurnContextSnapshots();
 const attach=({agent})=>{
  if(!agent||attached.has(agent)||path.resolve(agent.session?.header?.cwd||'/')!==workspace||!agent.ctx?.systemPrompt?.context)return;
  attached.add(agent);disposers.push(agent.ctx.systemPrompt.context({name:'huohuo:shared-context',order:195,text:()=>{
   const route=sharedContext.sessionRoute(agent.session);return snapshots.read(agent.session.id,route,()=>{const text=renderSharedContext(route,{includeLongTerm:false});
   if(route)atomicJSON(path.join(workspace,'.state/shared-context/last-injection-'+route.platform+'.json'),{at:new Date().toISOString(),platform:route.platform,chars:text.length,owner:route.owner,...sharedContext.status()});
   return text;});
  }}));
 };
 disposers.push(ctx.on('agent/created',attach));
 disposers.push(ctx.on('session/event',(session,event)=>{try{sharedContext.observe(session,event);snapshots.observe(session.id,event);}catch(e){ctx.logger.warn('共享上下文记录失败：'+e.message);}}));
 for(const agent of ctx.get('agents')?.list?.()||[])attach({agent});
 ctx.effect(()=>{sharedContext.prune();const timer=setInterval(()=>sharedContext.prune(),3600000);atomicJSON(path.join(workspace,'.state/shared-context/health.json'),{implementation:3,life:true,localRecall:true,startedAt:new Date().toISOString(),...sharedContext.status()});return()=>{clearInterval(timer);for(const dispose of disposers)dispose?.();attached.clear();snapshots.clear();};});
}
