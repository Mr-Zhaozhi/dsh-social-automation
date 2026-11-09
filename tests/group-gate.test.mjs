import test from 'node:test';import assert from 'node:assert/strict';
import {directAddress,evaluateGroupWake,recentContext} from '../lib/group-gate.mjs';
const base={kind:'group',groupId:'10000003',userId:'10000001',text:'那你觉得呢？',raw:'那你觉得呢？',messageId:'20',segments:[{type:'text',data:{text:'那你觉得呢？'}}]};
const policy={enabled:true,aliases:['小伴'],context_seconds:180,cooldown_seconds:5};
const now=1800000000000;
const ctx={selfId:()=> '10000002',config:{},call:async()=>({messages:[{message_id:'19',time:now/1000-10,sender:{user_id:'10000002'},raw_message:'这两个方案你更喜欢哪一个？'}]})};
test('只识别直接称呼，不把第三人称提及当作呼叫',()=>{assert(directAddress('小伴，你在吗',['小伴']));assert(directAddress('嘿，小伴帮我看看',['小伴']));assert(!directAddress('我觉得小伴很有趣',['小伴']));});
test('禁用群、私聊和自己发出的消息不会额外唤醒',async()=>{for(const [inbound,p] of [[base,{enabled:false}],[{...base,kind:'private'},policy],[{...base,userId:'10000002'},policy]])assert.equal((await evaluateGroupWake(inbound,ctx,{policy:p,now})).wake,false);});
test('回复和艾特其他成员不被上下文判断覆盖',async()=>{for(const inbound of [{...base,replyId:'99'},{...base,segments:[{type:'at',data:{qq:'123'}}]}])assert.equal((await evaluateGroupWake(inbound,ctx,{policy,now})).wake,false);});
test('没有近期机器人发言时不调用模型',async()=>{let called=false;assert.equal((await evaluateGroupWake(base,{...ctx,call:async()=>({messages:[]})},{policy,now,decide:()=>{called=true;}})).wake,false);assert(!called);});
test('明确接话才唤醒，低置信度和第三方聊天保持静默',async()=>{for(const [answer,expected] of [[{replyToBot:true,confidence:.96},true],[{replyToBot:true,confidence:.5},false],[{replyToBot:false,confidence:.99},false]])assert.equal((await evaluateGroupWake(base,ctx,{policy,now,decide:async()=>answer})).wake,expected);});
test('直接称呼不依赖模型可用性',async()=>{assert.equal((await evaluateGroupWake({...base,text:'小伴，在吗'},ctx,{policy,now})).wake,true);});
test('无标点的语音和表情请求直接唤醒，不调用历史或模型',async()=>{
 const offline={...ctx,call:async()=>{throw new Error('不应请求历史');}};
 for(const text of ['小伴出来聊天呀','霍霍出来聊天','小伴说几句北京话','小伴说句北京话','小伴讲两句粤语','小伴用劫的声音说一句','小伴发个表情','小伴给我说一句','小伴念一段','小伴换个音色']){
  assert.deepEqual(await evaluateGroupWake({...base,text},offline,{policy,now,decide:()=>{throw new Error('不应调用模型');}}),{wake:true,reason:'name-address'});
 }
 for(const text of ['小伴说过这件事','小伴说他不在','我让小伴说句北京话','小伴发的图挺好看'])assert.equal(directAddress(text,['小伴']),false);
});
test('过期、跨群和当前消息不进入判断上下文',()=>{assert.deepEqual(recentContext([{time:now/1000-500,sender:{user_id:'10000002'}},{time:now/1000,group_id:'999',sender:{user_id:'10000002'}},{time:now/1000,message_id:'20',sender:{user_id:'10000002'}}],base,'10000002',180,now),[]);});
