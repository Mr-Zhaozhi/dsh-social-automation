import test from 'node:test';import assert from 'node:assert/strict';import {canOwn,canSend,mergeDailyBudgets} from '../lib/fleet.mjs';
test('a second computer cannot take over an unexpired owner lease',()=>{const s={owner:'A',until:300000};assert.equal(canOwn(s,'B',100000),false);assert.equal(canSend(s,'B',100000),false);assert.equal(canOwn(s,'B',300001),true);});
test('old sender fences itself 90 seconds before a replacement may take over',()=>{const s={owner:'A',until:300000};assert.equal(canSend(s,'A',100000),true);assert.equal(canSend(s,'A',210000),false);assert.equal(canOwn(s,'B',210000),false);assert.equal(canSend(s,'A',300001),false);});
test('historical shared quotas survive reconnects without duplicating or reducing reservations',()=>{
 const key='2026-11-06:douyin:post',remote={[key]:[{id:'old',units:1}]},local={[key]:[{id:'old',units:1},{id:'pending',units:1}]};
 const merged=mergeDailyBudgets(remote,local,'2026-11-06');assert.equal(merged[key].length,2);assert.equal(remote[key].length,1);
 assert.deepEqual(mergeDailyBudgets(merged,local,'2026-11-06'),merged);
 assert.throws(()=>mergeDailyBudgets(remote,{[key]:[{id:'x',units:0}]},'2026-11-06'));
});
