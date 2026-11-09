import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {beginWatch} from '../lib/watch-budget.mjs';
test('cumulative time includes crashed reservations and cannot exceed 30 minutes',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'watch-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let now=Date.parse('2026-11-06T10:00:00Z');const options={root,now:()=>now,today:()=> '2026-11-06',maxSeconds:600};const a=beginWatch(options);now+=300000;a.finish();beginWatch(options);beginWatch(options);assert.equal(beginWatch(options).allowedMs,300000);assert.throws(()=>beginWatch(options),/30分钟/);});
test('session stops at the Beijing date boundary',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'watch-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));assert.equal(beginWatch({root,now:()=>Date.parse('2026-11-06T15:59:30Z'),today:()=> '2026-11-06'}).allowedMs,30000);});
test('existing platform ledgers and native playback consume one shared clock',async t=>{
 const {nativeBrowseAllowance}=await import('../lib/watch-budget.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-watch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const date='2026-11-06',opts={root,now:()=>Date.parse(date+'T10:00:00Z'),today:()=>date,maxSeconds:1800};
 fs.writeFileSync(path.join(root,'xiaohongshu.json'),JSON.stringify({version:1,entries:[{date,ms:300000,status:'settled'}]}));
 const watch=beginWatch({...opts,platform:'zhihu',nativeUsedMs:600000});assert.equal(watch.allowedMs,900000);
 assert.throws(()=>beginWatch({...opts,platform:'xiaohongshu',nativeUsedMs:600000}),/30分钟/);
 const native=nativeBrowseAllowance(600,{root,date,selection:{allowed:true}});assert.equal(native.remainingSeconds,0);assert.equal(native.allowed,false);
 watch.finish();assert.equal(nativeBrowseAllowance(600,{root,date,selection:{allowed:true}}).remainingSeconds,900);
 assert.equal(nativeBrowseAllowance(0,{root,date,selection:{allowed:false,reason:'not chosen'}}).allowed,false);
});
