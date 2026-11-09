import test from 'node:test';import assert from 'node:assert/strict';
import {nextTime,reconcile} from '../plugins/reliability.mjs';
import {verifiedClick,validCount} from '../lib/browser-actions.mjs';
const rule=()=>({key:'test',id:'old',sessionId:'s',enabled:true,days:1,startMinute:540,endMinute:1410,prompt:'p',title:'t'});
test('next random date stays tomorrow in Shanghai and is canonical',()=>{
 const now=Date.parse('2026-11-06T15:59:00.000Z');assert.equal(nextTime(rule(),now,()=>0),'2026-11-07T01:00:00.000Z');assert.equal(nextTime(rule(),now,()=>0.999),'2026-11-07T15:30:00.000Z');
});
test('deleting a reminder stops recurrence',async()=>{let rules=[rule()];await reconcile({catalog:async()=>[]},rules,async()=>{});assert.equal(rules[0].enabled,false);});
test('delivered reminder renews without the AI turn',async()=>{let rules=[rule()],n=0;await reconcile({catalog:async()=>[{id:'old',sessionId:'s',status:'inactive',lastDelivery:{}}],create:async()=>{n++;return {id:'next'};}},rules,async()=>{});assert.equal(n,1);assert.equal(rules[0].id,'next');});
test('crash after create adopts existing next reminder',async()=>{let rules=[rule()];await reconcile({catalog:async()=>[{id:'next',sessionId:'s',status:'active',title:'[自动化:test]t'}]},rules,async()=>{});assert.equal(rules[0].id,'next');});
test('paused imports are not activated',async()=>{let rules=[rule()];await reconcile({catalog:async()=>[{id:'old',sessionId:'s',status:'inactive'}],create:()=>{throw Error('must not run');}},rules,async()=>{});assert.equal(rules[0].id,'old');});
test('failed browser click propagates and is not success',async()=>{await assert.rejects(verifiedClick({click:async()=>{throw Error('click failed');}},async()=>false),/click failed/);});
test('already liked is never toggled off',async()=>{let n=0;assert.equal(await verifiedClick({click:()=>n++},async()=>true),false);assert.equal(n,0);});
test('invalid counts cannot create unbounded actions',()=>{for(const n of ['-1','1.1','Infinity','100','no'])assert.throws(()=>validCount(n,15));});

test('chat session change rebinds before deleting old reminder',async()=>{
 const rules=[{...rule(),chatId:'private:owner'}],calls=[];
 const service={catalog:async()=>[{id:'old',sessionId:'s',status:'active',scheduledAt:'2026-11-09T01:00:00.000Z'}],create:async(s,r)=>{calls.push('create:'+s);return {id:'new',scheduledAt:r.at}},delete:async()=>calls.push('delete')};
 await reconcile(service,rules,async()=>{},Date.parse('2026-11-06T01:00:00.000Z'),{'private:owner':'new-session'});
 assert.deepEqual(calls,['create:new-session','delete']);assert.equal(rules[0].sessionId,'new-session');assert.equal(rules[0].id,'new');
});
