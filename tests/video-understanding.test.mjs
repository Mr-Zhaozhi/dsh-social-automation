import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{pathToFileURL}from'node:url';
import{selectVideoFrames,videoNeedsDeep,validateVideoClip,validateAnalysis,analyzeVideo,videoUnderstandingSummary,packVideoFrames}from'../lib/video-understanding.mjs';import{harness}from'../lib/runtime.mjs';
const bytes=Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.alloc(200)]);
const clip=()=>({mimeType:'video/webm',data:bytes.toString('base64'),bytes:bytes.length,durationSeconds:15,videoDurationSeconds:15,complete:true});
const analysis=()=>({summary:'这杯热拿铁不是顾客的，所以并没有做错他的冰拿铁。',events:[{time:1,description:'点冰拿铁'},{time:14,description:'指出这杯不是他的'}],uncertain:[]});
const config={enabled:true,configured:true,provider:'qwen',model:'qwen3-vl-flash',maxDailyCalls:2};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-model-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('keyframes retain start/end, temporal coverage and changes instead of a fixed trio',()=>{
 const frames=Array.from({length:40},(_,i)=>({time:i,mimeType:'image/jpeg',data:'AAAA',change:i===17||i===31?.9:.01}));const selected=selectVideoFrames(frames);assert.equal(selected.length,12);for(const time of [0,17,31,39])assert(selected.some(f=>f.time===time));assert.deepEqual([...selected].sort((a,b)=>a.time-b.time),selected);
});
test('cloud is routed only for detail requests, absent speech or scene changes',()=>{
 const audio={status:'transcribed',text:'这是一段足够长的对白，用于普通聊天。'};assert.equal(videoNeedsDeep({audio}),null);assert.equal(videoNeedsDeep({audio,query:'仔细看看最后动作'}),'explicit-detail');assert.equal(videoNeedsDeep({audio:{status:'no-recognized-speech'}}),'visual-without-dialogue');assert.equal(videoNeedsDeep({audio,rawFrames:[.2,.3,.4].map(change=>({change}))}),'fast-scene-changes');
});
test('invalid clips and fabricated out-of-range events cannot become evidence',()=>{
 assert.doesNotThrow(()=>validateVideoClip(clip()));for(const p of [{bytes:1},{mimeType:'text/html'},{durationSeconds:121},{complete:true,videoDurationSeconds:40}])assert.throws(()=>validateVideoClip({...clip(),...p}));assert.throws(()=>validateAnalysis({...analysis(),events:[{time:60,description:'not observed'}]},15));assert.throws(()=>videoUnderstandingSummary({media:{type:'shared-work'},sharedWork:{videoId:'123'},videoUnderstanding:{...analysis(),status:'analyzed',workId:'999',method:'recorded-video-model',durationSeconds:15}}));
});
test('a cached video is reused across requests and daily attempts are capped',async t=>{
 const root=fixture(t);let calls=0,usage;const request=async payload=>{calls++;assert.equal(payload.clip.fps,4);assert.equal(payload.transcript,'对白');return{ok:true,analysis:analysis(),usage:{inputTokens:100,outputTokens:20}};};const options={root,config,request,record:r=>usage=r};const input={workId:'123',clip:clip(),audio:{status:'transcribed',text:'对白'},reason:'explicit-detail'};
 assert.equal((await analyzeVideo(input,options)).status,'analyzed');assert.equal((await analyzeVideo(input,options)).cached,true);assert.equal(calls,1);assert.equal(usage.status,'completed');assert.equal((await analyzeVideo({...input,workId:'456'},options)).status,'analyzed');assert.equal((await analyzeVideo({...input,workId:'789'},options)).reason,'video-model-daily-limit');assert.equal(calls,2);
 for(const f of fs.readdirSync(path.join(root,'.state/video-understanding')))assert(!fs.readFileSync(path.join(root,'.state/video-understanding',f),'utf8').includes(clip().data));
});
test('unconfigured, failed and concurrent calls do not loop or claim model success',async t=>{
 const root=fixture(t);let calls=0;const input={workId:'123',clip:clip(),reason:'visual-without-dialogue'};
 assert.equal((await analyzeVideo(input,{root,config:{...config,configured:false},request:()=>{throw Error('must not call');}})).reason,'video-model-not-configured');
 let release;const request=()=>{calls++;return new Promise(r=>{release=r;});};const options={root,config,request,record:()=>{}};const first=analyzeVideo(input,options);assert.equal((await analyzeVideo(input,options)).reason,'video-model-backoff');release({ok:false,code:'http-429'});assert.equal((await first).status,'unavailable');assert.equal((await analyzeVideo({...input,workId:'456'},options)).reason,'video-provider-backoff');assert.equal(calls,1);
});
test('native reply receives the scene timestamps and cloud analysis together',{skip:process.env.HUOHUO_NATIVE_TESTS!=='1'},async()=>{
 const{ChatAgent}=await import(pathToFileURL(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/chat-agent.mjs')));let request;const agent=new ChatAgent({config:{model:'fixture'},replyProvider:async r=>{request=r;return{text:'不是做错了，是这杯本来就不是他的。'};}});
 const observation={messageId:'m',media:{type:'shared-work'},sharedWork:{videoId:'123'},frames:[{mimeType:'image/jpeg',data:Buffer.from('fixture').toString('base64')}],visualTimeline:{workId:'123',method:'scene-change-and-time-coverage',sheets:[{image:1,cells:[{cell:1,time:0},{cell:2,time:14}]}]},videoUnderstanding:{status:'analyzed',workId:'123',method:'recorded-video-model',durationSeconds:15,complete:true,...analysis()}};
 await agent.reply({messages:[{id:'m',sender:'incoming',text:'为什么',media:{type:'shared-work'}}],mediaObservations:[observation]});const content=JSON.stringify(request.messages);assert.match(content,/并没有做错/);assert.match(content,/visualTimeline/);assert.match(content,/uncertain/);assert.match(request.system,/云端视频分析只是候选解释/);
});
const dual={...config,maxDailyCalls:6,providers:[{provider:'qwen',model:'qwen3.5-omni-flash',configured:true},{provider:'doubao',model:'doubao-seed-2-0-mini-260428',configured:true}]};
test('primary success never invokes backup; primary invalid analysis falls back with correct usage',async t=>{
 const root=fixture(t),seen=[],rows=[];let invalid=false;
 const request=async p=>{seen.push(p.provider);return{ok:true,analysis:invalid&&p.provider==='qwen'?{summary:'bad'}:analysis(),usage:{inputTokens:10,outputTokens:2}};};
 const opts={root,config:dual,request,record:r=>rows.push(r)};
 const input={workId:'123',clip:clip(),reason:'explicit-detail'};
 assert.equal((await analyzeVideo(input,opts)).provider,'qwen');assert.deepEqual(seen,['qwen']);
 invalid=true;const r=await analyzeVideo({...input,workId:'456'},opts);assert.equal(r.provider,'doubao');assert.equal(r.fallback,true);assert.deepEqual(seen,['qwen','qwen','doubao']);assert.deepEqual(rows.map(r=>r.status),['completed','failed','completed']);
 assert.equal((await analyzeVideo({...input,workId:'456'},opts)).cached,true);assert.equal(seen.length,3);
 // A provider cooldown does not suppress the healthy backup on another video.
 assert.equal((await analyzeVideo({...input,workId:'789'},opts)).provider,'doubao');assert.equal(seen.at(-1),'doubao');assert.equal(seen.length,4);
});
test('both failed requests count toward shared daily cap, fallback cannot exceed remaining budget',async t=>{
 const root=fixture(t),seen=[];const input={workId:'123',clip:clip(),reason:'explicit-detail'};
 const r=await analyzeVideo(input,{root,config:{...dual,maxDailyCalls:1},record:()=>{},request:async p=>{seen.push(p.provider);return{ok:false,code:'http-429'};}});
 assert.equal(r.reason,'video-model-daily-limit');assert.deepEqual(seen,['qwen']);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.state/video-understanding/budget.json'))).calls,1);
 const root2=fixture(t);seen.length=0;const both=await analyzeVideo(input,{root:root2,config:dual,record:()=>{},request:async p=>{seen.push(p.provider);throw Error('timeout');}});
 assert.equal(both.status,'unavailable');assert.deepEqual(seen,['qwen','doubao']);assert.equal(JSON.parse(fs.readFileSync(path.join(root2,'.state/video-understanding/budget.json'))).calls,2);
});
test('user cancellation does not start fallback or leave a one-hour negative cache',async t=>{
 const root=fixture(t),controller=new AbortController(),seen=[];
 const input={workId:'123',clip:clip(),reason:'explicit-detail',signal:controller.signal};
 const r=await analyzeVideo(input,{root,config:dual,record:()=>{},request:async p=>{seen.push(p.provider);controller.abort();throw Error('cancelled');}});
 assert.equal(r.reason,'aborted');assert.deepEqual(seen,['qwen']);
 const retry=await analyzeVideo({...input,signal:undefined},{root,config:dual,record:()=>{},request:async()=>({ok:true,analysis:analysis()})});assert.equal(retry.status,'analyzed');
});
