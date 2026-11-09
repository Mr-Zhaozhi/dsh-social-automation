import test from 'node:test';import assert from 'node:assert/strict';import {applyPlanSchedules} from '../lib/social-plan-schedules.mjs';
test('switching chosen feed removes old timers, restores planner pauses, preserves owner stops',async()=>{
 let tasks=[{id:'dy',sessionId:'owner',status:'active',title:'[自动化:douyin-like]抖音',scheduledAt:'2026-11-07T12:00:00.000Z',prompt:'dy'}];
 const service={catalog:async()=>tasks,list:async({sessionId})=>tasks.filter(t=>t.sessionId===sessionId),delete:async({id})=>{tasks=tasks.filter(t=>t.id!==id);},create:async(sessionId,args)=>{const task={...args,scheduledAt:args.at,id:'created-'+tasks.length,sessionId,status:'active'};tasks.push(task);return task;},update:async({id,change,...content})=>{const task=tasks.find(t=>t.id===id);Object.assign(task,{scheduledAt:change.at,title:content.title,prompt:content.prompt});return {record:task};}};
 const rules=[{key:'douyin-like',id:'dy',sessionId:'owner',enabled:true,title:'抖音',prompt:'dy'},{key:'xhs-social',sessionId:'owner',enabled:false,plannerPaused:true,title:'小红书',prompt:'xhs'},{key:'douyin-post',sessionId:'owner',enabled:false,title:'发布',prompt:'post'}];
 const plan={date:'2026-11-07',browsePlatform:'xiaohongshu',browseMinute:1200,publishMinute:1300};
 await applyPlanSchedules(service,rules,plan,async()=>{});assert.equal(rules[0].enabled,false);assert.equal(rules[0].plannerPaused,true);assert.equal(rules[1].enabled,true);assert.equal(rules[2].enabled,false);assert.equal(tasks.length,1);assert.match(tasks[0].title,/xhs-social/);
 await applyPlanSchedules(service,rules,{...plan,browsePlatform:'none',browseMinute:null,publishMinute:null},async()=>{});assert.equal(tasks.length,0);assert.equal(rules[1].plannerPaused,true);
 await applyPlanSchedules(service,rules,{...plan,browsePlatform:'douyin'},async()=>{});assert.equal(tasks.length,1);assert.match(tasks[0].title,/douyin-like/);assert.equal(rules[2].enabled,false);
});
