import test from 'node:test';import assert from 'node:assert/strict';
import {parseModelJSON,modelJSON} from '../lib/model.mjs';
import {changedContacts,acceptContactSnapshot} from '../lib/inbox-scan.mjs';
import {VideoProgress,advanceVideo} from '../lib/video-progress.mjs';
test('identical complete model repeats accepted, conflicting or truncated decisions rejected',()=>{
 assert.deepEqual(parseModelJSON('{"reply":true}{"reply":true}'),{reply:true});
 assert.throws(()=>parseModelJSON('{"reply":true}{"reply":false}'));
 assert.throws(()=>parseModelJSON('{"reply":true}garbage'));assert.throws(()=>parseModelJSON('{"reply":true}{'));
 assert.deepEqual(parseModelJSON('```json\n{"text":"a}b"}\n```'),{text:'a}b'});
});
test('stream final block replaces deltas even when provider omits delta index',async()=>{
 const ctx={agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},llm:{resolveModelInfo:async()=>({}),async *stream(){yield {type:'text-delta',text:'{"reply":'};yield {type:'text-delta',text:'true}'};yield {type:'block-end',index:0,block:{type:'text',text:'{"reply":true}'}};yield {type:'finish',reason:{kind:'stop'}};}}};
 assert.deepEqual(await modelJSON(ctx,'test',{},{recordUsage:()=>{}}),{reply:true});
});
test('idle scans baseline once then never reopen unchanged histories',()=>{
 const state={},contacts=[{uid:'a',preview:'old',time:'昨天'},{uid:'b',preview:'new',time:'now',unread:true}];
 assert.deepEqual(changedContacts(state,contacts).map(x=>x.uid),['b']);acceptContactSnapshot(state,contacts,['b']);
 contacts[1].unread=false;assert.equal(changedContacts(state,contacts).length,0);
 contacts[0].preview='reply';assert.deepEqual(changedContacts(state,contacts).map(x=>x.uid),['a']);
 acceptContactSnapshot(state,contacts,[]);assert.equal(changedContacts(state,contacts).length,1);
 acceptContactSnapshot(state,contacts,['a']);assert.equal(changedContacts(state,contacts).length,0);
});
test('video loops bounded by observations and elapsed time, identity change resets',()=>{
 const p=new VideoProgress();for(let i=0;i<4;i++)assert.equal(p.observe('1',i*1000),false);
 assert.equal(p.observe('1',5000),true);assert.equal(p.observe('2',6000),false);assert.equal(p.observe('2',96000),true);
});
test('next must have a ready different video; unrelated side effects cannot be success',async()=>{
 await assert.rejects(advanceVideo(async()=>({changed:true,state:{video:{id:'1',readyState:4}}}),'1'));
 await assert.rejects(advanceVideo(async()=>({changed:true,state:{video:{id:'2',readyState:0}}}),'1'));
 let options;await advanceVideo(async(_n,_a,o)=>{options=o;return {changed:true,state:{video:{id:'2',readyState:4}}};},'1');assert.equal(options.expectedVideoId,'1');
});
import {cliFailure,recordReplyFailure} from '../lib/cli-result.mjs';
test('only definitely unsent replies retry, with a finite bound',()=>{
 const state={deliveries:{},queue:[]},original={key:'a'};
 const e=cliFailure(Object.assign(Error('process failed'),{stdout:JSON.stringify({error:'draft exists',deliveryUncertain:false})}));
 recordReplyFailure(state,'a',e,original);assert.equal(state.deliveries.a.status,'not-sent');assert.equal(state.queue.length,1);
 state.queue=[];recordReplyFailure(state,'a',e,{...original,attempts:2});assert.equal(state.queue.length,0);
 recordReplyFailure(state,'b',cliFailure(Object.assign(Error('timeout'),{stdout:'incomplete'})),{key:'b'});assert.equal(state.deliveries.b.status,'unknown');assert.equal(state.queue.length,0);
});
test('relative timestamp aging does not reopen unchanged conversation',()=>{
 const state={},c={uid:'1',preview:'same',time:'刚刚'};acceptContactSnapshot(state,[c],[]);
 assert.equal(changedContacts(state,[{...c,time:'1分钟前'}]).length,0);
 assert.equal(changedContacts(state,[{...c,messageId:'new'}]).length,1);
});


test('contending browser work waits for release without overlapping actions',async()=>{
 const {lock,waitForLock}=await import('../lib/runtime.mjs');const name='test-inbox-lock-'+process.pid;
 const release=lock(name);let released=false;
 const timer=setTimeout(()=>{released=true;release();},60);
 try{const next=await waitForLock(name,{timeoutMs:1000,pollMs:5});try{assert.equal(released,true);assert.throws(()=>lock(name),{code:'LOCK_BUSY'});}finally{next();}}
 finally{clearTimeout(timer);release();}
});
test('browser lock wait is bounded and preserves the existing owner',async()=>{
 const {lock,waitForLock}=await import('../lib/runtime.mjs');const name='test-inbox-timeout-'+process.pid;const release=lock(name);
 try{await assert.rejects(waitForLock(name,{timeoutMs:25,pollMs:5}),{code:'LOCK_BUSY'});assert.throws(()=>lock(name),{code:'LOCK_BUSY'});}finally{release();}
});
