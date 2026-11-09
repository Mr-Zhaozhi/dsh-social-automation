import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reschedule} from '../lib/schedule-update.mjs';
import {assertRunner} from '../lib/fleet.mjs';
export const name='huohuo-reliability';
export const inject=['schedule'];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requestsPath=path.join(root,'.state/schedule-requests');
const rulesPath=path.join(root,'automation-schedules.json');
const statusPath=path.join(root,'.state/schedules.json');
function write(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v,null,2),{mode:0o600});fs.renameSync(tmp,p);}
export function nextTime(rule,now=Date.now(),random=Math.random){
  const local=new Date(now+8*3600000);local.setUTCHours(0,0,0,0);local.setUTCDate(local.getUTCDate()+rule.days);
  const minute=rule.startMinute+Math.floor(random()*(rule.endMinute-rule.startMinute+1));
  return new Date(local.getTime()+minute*60000-8*3600000).toISOString();
}
export async function reconcile(service,rules,save,now=Date.now(),bindings={}){
  const events=[];const catalog=await service.catalog();
  for(const r of rules){
    if(!r.enabled)continue;
    const marker='[自动化:'+r.key+']';
    const binding=bindings[r.chatId];
    const target=typeof binding==='string'?binding:binding?.session;
    if(target&&target!==r.sessionId){
      const old=catalog.find(t=>t.id===r.id&&t.sessionId===r.sessionId);
      let migrated=catalog.find(t=>t.sessionId===target&&t.status==='active'&&t.title?.startsWith(marker));
      if(!migrated&&old){
        if(old.status==='inactive'&&!old.lastDelivery){events.push({key:r.key,status:'inactive_requires_review'});continue;}
        migrated=await service.create(target,{title:marker+r.title,prompt:r.prompt,at:Date.parse(old.scheduledAt)>now?old.scheduledAt:nextTime(r,now)});
      }
      if(migrated){
        if(old)await service.delete({sessionId:r.sessionId,id:r.id});
        r.id=migrated.id;r.sessionId=target;await save(rules);events.push({key:r.key,status:'session_rebound',at:migrated.scheduledAt});continue;
      }
    }
    const adopted=catalog.find(t=>t.sessionId===r.sessionId&&t.status==='active'&&t.title?.startsWith(marker)&&t.id!==r.id);
    if(adopted){r.id=adopted.id;await save(rules);events.push({key:r.key,status:'adopted'});continue;}
    const task=catalog.find(t=>t.id===r.id&&t.sessionId===r.sessionId);
    if(!task){r.enabled=false;await save(rules);events.push({key:r.key,status:'stopped_task_deleted'});continue;}
    if(task.status==='active'){
      const expected=(await service.list({sessionId:r.sessionId})).find(t=>t.id===r.id);
      if(expected&&(expected.prompt!==r.prompt||expected.title!==marker+r.title)){
        const result=await service.update({sessionId:r.sessionId,id:r.id,expected,prompt:r.prompt,title:marker+r.title});
        if(!result.updated&&!result.record)throw new Error('schedule update refused: '+(result.code||'unknown'));
      }
      events.push({key:r.key,status:'active',at:task.scheduledAt});continue;
    }
    // Only renew a delivered task; paused imports have no lastDelivery.
    if(!task.lastDelivery){events.push({key:r.key,status:'inactive_requires_review'});continue;}
    const next=await service.create(r.sessionId,{title:marker+r.title,prompt:r.prompt,at:nextTime(r,now)});
    r.id=next.id;await save(rules);events.push({key:r.key,status:'renewed',at:next.scheduledAt});
  }
  return events;
}
export function apply(ctx){
  let busy=false,disposed=false;
  const tick=async()=>{
    if(busy||disposed)return;busy=true;
    try{
      await assertRunner();
      const rules=JSON.parse(fs.readFileSync(rulesPath,'utf8'));
      fs.mkdirSync(requestsPath,{recursive:true});
      for(const filename of fs.readdirSync(requestsPath).filter(n=>n.endsWith('.json')).sort((a,b)=>fs.statSync(path.join(requestsPath,a)).mtimeMs-fs.statSync(path.join(requestsPath,b)).mtimeMs)){
        const requestPath=path.join(requestsPath,filename),request=JSON.parse(fs.readFileSync(requestPath));
        const targets=rules.filter(r=>request.key==='all'||r.key===request.key);
        for(const r of targets){
          if(request.action==='stop'){
            if(r.id)await ctx.schedule.delete({sessionId:r.sessionId,id:r.id});r.enabled=false;delete r.plannerPaused;
          }else if(request.action==='resume'){
            const marker='[自动化:'+r.key+']';
            const existing=(await ctx.schedule.catalog()).find(t=>t.sessionId===r.sessionId&&t.status==='active'&&t.title?.startsWith(marker));
            const next=existing||await ctx.schedule.create(r.sessionId,{title:marker+r.title,prompt:r.prompt,at:nextTime(r)});
            r.id=next.id;r.enabled=true;delete r.plannerPaused;
          }else if(request.action==='reschedule'){
            if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(request.at)||Date.parse(request.at)<=Date.now())throw new Error('重新安排时间必须是未来的标准UTC时间');
            await reschedule(ctx.schedule,r,request.at);
          }
          write(rulesPath,rules);
        }
        fs.renameSync(requestPath,requestPath+'.done');
      }
      const mappingFile=path.join(process.env.DSH_HOME||path.join(os.homedir(),'Library/Application Support/dsh-desktop/harness'),'media/onebot/chat-sessions.json');
      const bindings=fs.existsSync(mappingFile)?JSON.parse(fs.readFileSync(mappingFile)):{};
      const status=await reconcile(ctx.schedule,rules,async r=>write(rulesPath,r),Date.now(),bindings);
      write(statusPath,{checkedAt:new Date().toISOString(),status});
    }catch(e){
      if(e.code==='FLEET_STANDBY')write(statusPath,{checkedAt:new Date().toISOString(),status:'standby'});
      else{write(statusPath,{checkedAt:new Date().toISOString(),error:String(e.message).slice(0,200)});ctx.logger.warn('huohuo schedule audit: '+e.message);}
    }
    finally{busy=false;}
  };
  ctx.effect(()=>{const timer=setInterval(()=>void tick(),60000);void tick();return ()=>{disposed=true;clearInterval(timer);};});
}
