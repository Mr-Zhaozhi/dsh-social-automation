import test from 'node:test';
import assert from 'node:assert/strict';
import {directAddressHandler} from '../lib/group-address.mjs';
const policy={enabled:true,aliases:['小伴']};
const message={kind:'group',groupId:'10000003',userId:'10000001',text:'小伴说几句北京话',segments:[{type:'text',data:{text:'小伴说几句北京话'}}]};
test('direct request changes mention gating only for that invocation',async()=>{
 const originalConfig={requireMention:true,groupPolicy:'allowlist',restrictedMemberPrefix:true};
 const receiver={ctx:{config:originalConfig,selfId:()=> '10000002'},seenMessages:new Map()};
 let calls=0;
 const wrapped=directAddressHandler(async function(inbound){
  calls++;assert.equal(this.ctx.config.requireMention,false);assert.equal(this.ctx.config.groupPolicy,'allowlist');assert.equal(this.ctx.config.restrictedMemberPrefix,true);
  assert.equal(this.seenMessages,receiver.seenMessages);assert.equal(inbound,message);
  await Promise.resolve();assert.equal(receiver.ctx.config.requireMention,true);
 },()=>policy);
 await wrapped.call(receiver,message);assert.equal(calls,1);assert.equal(receiver.ctx.config,originalConfig);
});
test('unapproved groups, quotes, other mentions, self and third-person text retain native gating',async()=>{
 const receiver={ctx:{config:{requireMention:true},selfId:()=> '10000002'}};
 let calls=0;
 const wrapped=directAddressHandler(function(){calls++;assert.equal(this,receiver);assert.equal(this.ctx.config.requireMention,true);},id=>id==='10000003'?policy:undefined);
 for(const inbound of [{...message,groupId:'other'},{...message,replyId:'123'},{...message,segments:[{type:'at',data:{qq:'10000009'}}]},{...message,userId:'10000002'},{...message,kind:'private'},{...message,text:'小伴说过这件事'}])await wrapped.call(receiver,inbound);
 assert.equal(calls,6);
});
