import {reschedule} from './schedule-update.mjs';import {atMinute} from './social-plan.mjs';
export async function applyPlanSchedules(service,rules,plan,save){
   for(const [key,minute] of [['douyin-like',plan.browsePlatform==='douyin'?plan.browseMinute+1:null],['douyin-post',plan.publishMinute],['xhs-social',plan.browsePlatform==='xiaohongshu'?plan.browseMinute:null]]){
    const r=rules.find(r=>r.key===key);if(!r||!r.enabled&&!r.plannerPaused)continue;
    if(minute===null){if(r.id)await service.delete({sessionId:r.sessionId,id:r.id});r.enabled=false;r.plannerPaused=true;delete r.id;await save(rules);continue;}
    r.enabled=true;delete r.plannerPaused;r.startMinute=minute;r.endMinute=minute;
    if(r.id)await reschedule(service,r,atMinute(plan.date,minute),{title:'[自动化:'+r.key+']'+r.title,prompt:r.prompt});
    else{
     const existing=(await service.catalog()).find(t=>t.sessionId===r.sessionId&&t.status==='active'&&t.title?.startsWith('[自动化:'+r.key+']'));
     if(existing){r.id=existing.id;await reschedule(service,r,atMinute(plan.date,minute),{title:'[自动化:'+r.key+']'+r.title,prompt:r.prompt});}
     else{const task=await service.create(r.sessionId,{title:'[自动化:'+r.key+']'+r.title,prompt:r.prompt,at:atMinute(plan.date,minute)});r.id=task.id;}
    }
    await save(rules);
   }
}
