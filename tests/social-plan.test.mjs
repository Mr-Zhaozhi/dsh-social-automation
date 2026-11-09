import test from 'node:test';import assert from 'node:assert/strict';import {validatePlan,constrainPlan,localClock,atMinute} from '../lib/social-plan.mjs';
const now=Date.parse('2026-11-06T10:00:00.000Z'),good={browsePlatform:'douyin',browseMinute:1100,douyinWindows:[[1100,1110],[1200,1220]],publishMinute:1250};
test('valid autonomous plan retains Shanghai date and future canonical times',()=>{assert.equal(localClock(now).minute,1080);assert.equal(validatePlan(good,now).date,'2026-11-06');assert.equal(atMinute('2026-11-06',1100),'2026-11-06T10:20:00.000Z');});
test('cannot exceed 30 minutes, overlap, cross midnight or schedule in the past',()=>{for(const windows of [[[1100,1131]],[[1100,1120],[1110,1120]],[[1430,1450]],[[1070,1080]]])assert.throws(()=>validatePlan({...good,douyinWindows:windows},now));assert.throws(()=>validatePlan({...good,browseMinute:1080},now));});
test('model-selected starts are kept while the program caps merged durations',()=>{const plan=constrainPlan({...good,douyinWindows:[[1100,1120],[1110,1130],[1200,1220]]});assert.deepEqual(plan.douyinWindows,[[1100,1130]]);validatePlan(plan,now);});

test('one platform or no browsing; publication remains independent',()=>{
 for(const platform of ['xiaohongshu','zhihu','none']){const plan=validatePlan({...good,browsePlatform:platform,browseMinute:platform==='none'?null:1150,douyinWindows:[],publishMinute:null},now);assert.equal(plan.browsePlatform,platform);assert.equal(plan.policyVersion,2);}
 assert.throws(()=>validatePlan({...good,browsePlatform:'xiaohongshu'},now));assert.throws(()=>validatePlan({...good,browsePlatform:['douyin','zhihu']},now));
});
