import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
import {meteredStream} from '../lib/model-usage.mjs';
import {deferModelFailure,clearModelFailure} from '../lib/model-retry.mjs';
import {eligibility} from '../lib/companion-policy.mjs';
import {TurnContextSnapshots} from '../lib/turn-context.mjs';
import {audit,costUsage,nativeUsage,pluginUsage} from '../cost-audit.mjs';
test('usage snapshots are not summed twice and logs contain no prompt or reply',async()=>{
 let row;const ctx={llm:{async *stream(){yield {type:'usage',usage:{inputTokens:100,cacheReadTokens:900,outputTokens:10}};yield {type:'text-delta',text:'PRIVATE REPLY'};yield {type:'usage',usage:{inputTokens:100,cacheReadTokens:900,outputTokens:20}};yield {type:'finish',reason:{kind:'stop'}};}}};
 for await(const _ of meteredStream(ctx,{model:'deepseek-flash',sessionId:'fixture',system:'PRIVATE PROMPT'},{record:r=>row=r})){}
 assert.deepEqual(row.usage,{inputTokens:100,cacheReadTokens:900,outputTokens:20});assert.equal(row.status,'completed');assert.doesNotMatch(JSON.stringify(row),/PRIVATE/);
});
test('failed and missing usage remain visible, never reported as free success',async()=>{
 let row;const ctx={llm:{async *stream(){yield {type:'usage',usage:{inputTokens:100}};throw Error('network');}}};
 await assert.rejects(async()=>{for await(const _ of meteredStream(ctx,{model:'test'},{record:r=>row=r})){}},/network/);
 assert.equal(row.status,'failed');assert.equal(row.usage.inputTokens,100);
 ctx.llm.stream=async function*(){yield {type:'finish',reason:{kind:'stop'}};};
 for await(const _ of meteredStream(ctx,{}, {record:r=>row=r})){}assert.equal(row.usage,null);
});
test('proactive model failures back off persistently without changing send limits',()=>{
 const now=Date.parse('2026-11-07T12:00:00+08:00'),prefs={level:90,quietStart:0,quietEnd:10};let s={sends:[]};
 for(const minutes of [5,10,20,30,30]){s=deferModelFailure(JSON.parse(JSON.stringify(s)),now);assert.equal(s.modelRetryAt,now+minutes*60000);assert.equal(eligibility(s,prefs,now).reason,'model-backoff');}
 assert.equal(eligibility(s,prefs,s.modelRetryAt).due,true);clearModelFailure(s);assert.equal(s.modelFailures,undefined);assert.equal(eligibility(s,prefs,now).due,true);
});
test('context stays stable across tools, refreshes next turn and invalidates changed identity',()=>{
 const c=new TurnContextSnapshots();let n=0;const read=route=>c.read('qq-session',route,()=>String(++n));
 const route={owner:true,peer:'one'};assert.equal(read(route),'1');
 c.observe('qq-session',{type:'assistant/message'});c.observe('qq-session',{type:'user/message',data:{source:{kind:'plugin',form:'snapshot'}}});assert.equal(read(route),'1');
 c.observe('wechat-session',{type:'turn/start'});assert.equal(read(route),'1');
 c.observe('qq-session',{type:'turn/start'});assert.equal(read(route),'2');
 assert.equal(read({...route,owner:false}),'3');c.observe('qq-session',{type:'user/message',data:{source:{kind:'plugin:dsh-onebot'}}});assert.equal(read(route),'4');
});
test('pricing counts uncached input and cache separately; weekend is offpeak; unknown model is unknown',()=>{
 const u={inputTokens:1000000,cacheReadTokens:1000000,outputTokens:1000000};
 assert.equal(costUsage(u,'deepseek-flash',Date.parse('2026-11-06T10:00:00+08:00')).estimateCNY,10.04);
 assert.equal(costUsage(u,'deepseek-flash',Date.parse('2026-11-07T10:00:00+08:00')).estimateCNY,5.02);
 assert.equal(costUsage(u,'unknown',Date.now()).estimateCNY,null);
});
test('audit reads concatenated frames, skips unfinished tail and deduplicates replayed messages',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cost-audit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const time=Date.parse('2026-11-07T10:00:00+08:00'),msg={type:'assistant/message',seq:2,time,data:{message:{id:'one',source:{model:'deepseek-flash'}},usage:{inputTokens:100,cacheReadTokens:900,outputTokens:20}}};
 for(const id of ['onebot-private-1','onebot-private-2']){const dir=path.join(root,'workspace',id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'session.v4.jsonl.zstd'),Buffer.concat([{type:'session',id,cwd:'/fixture/huohuo-qq'},msg].map(r=>zlib.zstdCompressSync(Buffer.from(JSON.stringify(r)+'\n'))).concat([Buffer.from('unfinished')])));}
 const a=audit(root);assert.equal(a.files,2);assert.equal(a.requests.length,1);assert.equal(a.groups[0].input,1000);
});
test('direct ledgers handle DSH misses versus API total input and retain unknown usage',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'usage-ledgers-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const at='2026-11-07T02:00:00Z',model='deepseek-flash';
 fs.writeFileSync(path.join(root,'2026-11-07.jsonl'),[
  {id:'dsh',at,model,kind:'chat',source:'dsh',usage:{promptTokens:100,cachedTokens:900,completionTokens:20}},
  {id:'api',at,model,kind:'chat',source:'api',usage:{promptTokens:1000,cachedTokens:900,completionTokens:20}},
  {id:'unknown',at,model,kind:'chat',source:'dsh',usage:null},
 ].map(r=>JSON.stringify(r)).join('\n'));
 const [g]=nativeUsage(root);assert.equal(g.requests,3);assert.equal(g.unknownUsage,1);assert.equal(g.estimateCNY,2*costUsage({inputTokens:100,cacheReadTokens:900,outputTokens:20},model,Date.parse(at)).estimateCNY);
 fs.writeFileSync(path.join(root,'2026-11-07.jsonl'),JSON.stringify({id:'plugin',at,model,purpose:'fixture',status:'failed',usage:null})+'\n');
 const [p]=pluginUsage(root);assert.equal(p.requests,1);assert.equal(p.failed,1);assert.equal(p.unknownUsage,1);
});
