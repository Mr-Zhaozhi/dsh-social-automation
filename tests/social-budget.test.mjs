import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SocialBudget} from '../lib/social-budget.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let date='2026-11-06';return {budget:new SocialBudget({root,today:()=>date}),root,next:()=>date='2026-11-07'};}
test('15 private deliveries shared across concurrent callers and restarts',async t=>{
 const {budget,root}=fixture(t);let sent=0;
 const results=await Promise.allSettled(Array.from({length:20},(_,i)=>budget.run('douyin','private','person-'+i,async()=>{sent++;return {confirmed:true};})));
 assert.equal(sent,15);assert.equal(results.filter(x=>x.status==='rejected').length,5);
 await assert.rejects(new SocialBudget({root,today:()=> '2026-11-06'}).run('douyin','private','share-target',async()=>{sent++;}),/15/);assert.equal(sent,15);
});
test('unknown and interrupted sends retain slots, proven non-delivery releases slot',async t=>{
 const {budget}=fixture(t);
 await budget.run('douyin','private','a',async()=>({confirmed:false,deliveryUncertain:false}));
 await assert.rejects(budget.run('douyin','private','a',async()=>{throw new Error('network result unknown');}));
 for(let i=0;i<14;i++)await budget.run('douyin','private','a',async()=>({confirmed:true}));
 await assert.rejects(budget.run('douyin','private','a',async()=>({confirmed:true})),/15/);
});
test('100 comments; platforms and Beijing dates have separate budgets',t=>{
 const {budget,next}=fixture(t);for(let i=0;i<100;i++)budget.reserve('douyin','comment',String(i));
 assert.throws(()=>budget.reserve('douyin','comment','101'),/100/);
 budget.reserve('xiaohongshu','comment','1');next();budget.reserve('douyin','comment','new-day');
});
test('share card plus caption reserves two messages atomically',async t=>{const {budget}=fixture(t);for(let i=0;i<14;i++)budget.reserve('xiaohongshu','private','a');let sent=false;await assert.rejects(budget.run('xiaohongshu','private','a',async()=>{sent=true;return {confirmed:true};},[],2),/15/);assert.equal(sent,false);assert.equal(budget.remaining('xiaohongshu','private'),1);});
test('imports existing same-day receipts once and refuses corrupt history',t=>{
 const {budget,root}=fixture(t);const history=Array.from({length:14},()=>({date:'2026-11-06'}));budget.reserve('douyin','private','last',history);
 assert.throws(()=>budget.reserve('douyin','private','extra',history),/15/);
 fs.writeFileSync(path.join(root,'xiaohongshu-private.json'),'broken');assert.throws(()=>budget.reserve('xiaohongshu','private','a'));
});
test('a post published before shared sync still blocks another publication',async t=>{
 const {budget}=fixture(t);budget.seed('douyin','post',[{day:'2026-11-06'}]);budget.seed('douyin','post',[{day:'2026-11-06'}]);let sent=false;
 await assert.rejects(budget.run('douyin','post','new-video',async()=>{sent=true;return {confirmed:true};}),/1/);
 assert.equal(sent,false);assert.equal(budget.remaining('douyin','post'),0);
});
