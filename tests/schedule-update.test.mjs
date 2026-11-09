import test from 'node:test';import assert from 'node:assert/strict';
import {reschedule} from '../lib/schedule-update.mjs';
const at='2026-11-06T13:00:00.000Z',rule={sessionId:'s',id:'t'};
test('real DSH active list has no status; timing uses the change object',async()=>{
 let record={id:'t',kind:'at',title:'title',prompt:'prompt',scheduledAt:'2026-11-07T01:00:00.000Z'};
 const service={list:async()=>[record],update:async request=>{assert.equal(request.expected,record);assert.deepEqual(request.change,{kind:'at',at});assert.equal(request.at,undefined);record={...record,scheduledAt:request.change.at};return {updated:true,record};}};
 assert.equal((await reschedule(service,rule,at)).scheduledAt,at);
});
test('silent ignored timing updates and stale readbacks cannot report success',async()=>{
 const old={id:'t',scheduledAt:'2026-11-07T01:00:00.000Z'};
 await assert.rejects(reschedule({list:async()=>[old],update:async()=>({updated:false,record:old})},rule,at),/未保存/);
 await assert.rejects(reschedule({list:async()=>[old],update:async()=>({updated:true,record:{...old,scheduledAt:at}})},rule,at),/回读/);
});
test('ended or deleted tasks cannot be implicitly reactivated',async()=>{
 await assert.rejects(reschedule({list:async()=>[],update:()=>{throw Error('must not call');}},rule,at),/有效任务/);
});
