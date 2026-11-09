import test from 'node:test';import assert from 'node:assert/strict';
import {parsePreference,settingsFor,eligibility} from '../lib/companion-policy.mjs';
import {continuingDialogue,evaluateGroupWake} from '../lib/group-gate.mjs';
const now=Date.parse('2026-11-06T12:00:00Z'),prefs={level:70,quietStart:23,quietEnd:9};
test('owner can adjust proactivity naturally without changing scripts',()=>{
 assert.equal(parsePreference('小伴，主动一点',70).level,90);
 assert.equal(parsePreference('以后少主动点',70).level,50);
 assert.equal(parsePreference('主动程度调到80').level,80);
 assert.equal(parsePreference('主动程度再提高一点',70).level,90);assert.equal(parsePreference('多主动找我闲聊',70).level,90);
 assert.equal(parsePreference('别主动找我').level,0);
 assert.equal(parsePreference('配置的固定音色说你应该主动一点'),null);
 assert.deepEqual(parsePreference('新增主动群 123456'),{kind:'group',enabled:true,target:'123456'});
});
test('daily cap, quiet hours and two unanswered initiations stop unsolicited messages',()=>{
 assert(eligibility({sends:[]},prefs,now,'2026-11-06').due);
 assert(!eligibility({sends:[]},prefs,Date.parse('2026-11-06T16:00:00Z'),'2026-11-07').due);
 assert(!eligibility({sends:[{at:now-6e6,status:'confirmed'},{at:now-5e6,status:'confirmed'}]},prefs,now,'2026-11-06').due);
 assert(!eligibility({sends:[{at:now-8e6,status:'unknown'}]},prefs,now,'2026-11-06').due);
 assert(!settingsFor(0).enabled);
});
test('same speaker can change topics and continue without saying the bot name',()=>{
 assert(continuingDialogue([{speaker:'current_user',text:'小伴在吗'},{speaker:'bot',text:'在呀'}]));
 assert(!continuingDialogue([{speaker:'current_user'},{speaker:'bot'},{speaker:'other'}]));
 assert(!continuingDialogue([{speaker:'other'},{speaker:'bot'}]));
});
test('a new-topic question follows the owner conversation',async()=>{
 const inbound={kind:'group',groupId:'123',userId:'owner',text:'你看过那部电影吗',messageId:'3',segments:[]};
 const ctx={selfId:()=> 'bot',config:{},call:async()=>({messages:[{message_id:'1',time:now/1000-35,sender:{user_id:'owner'},raw_message:'小伴在干嘛'},{message_id:'2',time:now/1000-30,sender:{user_id:'bot'},raw_message:'在呀'}]})};
 const result=await evaluateGroupWake(inbound,ctx,{now,policy:{enabled:true,context_seconds:600},decide:()=>{throw Error('should not need classification');}});
 assert.equal(result.reason,'ongoing-dialogue');assert(result.wake);
});
test('high proactivity wakes after owner idle without notifications restarting long cooldown',()=>{
 const p={...prefs,level:90};assert.equal(settingsFor(90).idleMinutes,8);
 assert(eligibility({sends:[{at:now-2*3600000,status:'confirmed',testId:'a'},{at:now-3600000,status:'confirmed',testId:'b'}],lastOwnerAt:now-3*3600000},p,now,'2026-11-06').due);
 assert(eligibility({sends:[],lastOwnerAt:now-9*60000,lastBotAt:now-3*60000},p,now,'2026-11-06').due);
 assert.equal(eligibility({sends:[],lastOwnerAt:now-2*60000},p,now,'2026-11-06').reason,'recent-chat');
 assert.equal(eligibility({sends:[],lastOwnerAt:now-20*60000,lastBotAt:now-30000},p,now,'2026-11-06').reason,'just-replied');
 assert.equal(eligibility({sends:[{at:now-5*60000,status:'confirmed'}],lastOwnerAt:now-10*60000},p,now,'2026-11-06').reason,'cooldown');
 assert(eligibility({sends:[{at:now-2*86400000,status:'unknown'}],lastOwnerAt:now-10*60000},p,now,'2026-11-06').due);
});

test('proactive openers reject fabricated browsing, physical experiences, pressure and fake images',async()=>{
 const {proactiveProblem}=await import('../lib/companion-content.mjs');
 for(const text of ['朋友，上午刷到个离谱说法','我刚出门买奶茶了','怎么不回我','[表情: 得意]','她小心眼也不会认'])assert(proactiveProblem(text));
 for(const text of ['给“再躺五分钟”颁个奖，最会自动续费。','突然想给今天起个外号，叫加载中的星期六。'])assert.equal(proactiveProblem(text),null);
});
