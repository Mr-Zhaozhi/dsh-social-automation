import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {incomingEvidence,workLink} from '../lib/incoming-media.mjs';import {beginWatch,nativeBrowseAllowance} from '../lib/watch-budget.mjs';import {browseSelection} from '../lib/browse-policy.mjs';import {incomingCandidates} from '../lib/inbox-state.mjs';import {modelJSON} from '../lib/model.mjs';
test('incoming work requires an exact supported HTTPS item and a real event identity',()=>{
 const base={platform:'douyin',eventId:'event',peer:'peer',kind:'private-share',url:'https://www.douyin.com/video/123'};
 assert.equal(incomingEvidence(base).id,'123');
 for(const url of ['https://www.douyin.com/','https://www.douyin.com.evil.test/video/123','http://www.douyin.com/video/123','https://user@www.douyin.com/video/123'])assert.throws(()=>incomingEvidence({...base,url}));
 assert.throws(()=>incomingEvidence({...base,eventId:''}));assert.throws(()=>incomingEvidence({...base,kind:'feed'}));
 assert.equal(workLink('https://www.douyin.com/jingxuan?modal_id=123','douyin').id,'123');
 assert.equal(workLink('https://www.xiaohongshu.com/explore/1234567890abcdef12345678?xsec_token=example','xiaohongshu').id,'1234567890abcdef12345678');
});
test('incoming sampling bypasses platform selection but reserves the same finite daily budget',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'incoming-watch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const date='2026-11-07',now=Date.parse(date+'T11:00:00+08:00');fs.mkdirSync(path.join(root,'.state'));fs.writeFileSync(path.join(root,'.state/social-plan.json'),JSON.stringify({date,status:'ready',plan:{policyVersion:2,browsePlatform:'none',browseMinute:1300}}));
 assert.equal(browseSelection('douyin',{root,date,now}).allowed,false);
 const evidence=incomingEvidence({platform:'douyin',eventId:'e1',peer:'owner',kind:'private-share',url:'https://www.douyin.com/video/123'});
 const budgetRoot=path.join(root,'watch'),args={root:budgetRoot,platform:'douyin-incoming',purpose:'incoming',evidence,now:()=>now,today:()=>date,maxSeconds:900,nativeUsedMs:1790000};
 assert.equal(beginWatch(args).allowedMs,10000);assert.throws(()=>beginWatch(args),/30分钟/);
 assert.equal(nativeBrowseAllowance(1790,{root:budgetRoot,date,selection:{allowed:true}}).remainingSeconds,0);
 assert.throws(()=>beginWatch({...args,evidence:{}}),/证据/);
});
test('new received card enters the ordinary deduplicated reply queue; system or unknown attachments do not',()=>{
 const state={initialized:true,seen:{p:'old'},deliveries:{}};const c={uid:'p',messages:[{id:'share',mine:false,sharedUrl:'https://www.xiaohongshu.com/explore/1234567890abcdef12345678'}]};
 assert.equal(incomingCandidates(state,[c]).length,1);assert.equal(incomingCandidates(state,[c]).length,0);
 c.messages.push({id:'hint',mine:false,unsupported:true});assert.equal(incomingCandidates(state,[c]).length,0);
});
test('actual sampled image bytes become attachment-backed model parts, never fabricated visual text',async()=>{
 let request,saved;const ctx={get:()=>({saveImage:async input=>{saved=input;return {id:'fixture-image'};}}),agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},llm:{resolveModelInfo:async()=>({}),async *stream(r){request=r;yield {type:'block-end',block:{type:'text',text:'{"reply":false}'}};yield {type:'finish',reason:{kind:'stop'}};}}};
 await modelJSON(ctx,'test',{understandingScope:'timed-video-sampling'},{recordUsage:()=>{},images:[{mimeType:'image/jpeg',data:Buffer.from('fixture').toString('base64')}]});
 assert.equal(saved.mediaType,'image/jpeg');assert.equal(saved.data.toString(),'fixture');assert.deepEqual(request.messages[0].content.at(-1),{type:'image',attachment:{id:'fixture-image'}});
});
test('platform warning hold dominates normal resume, browsing and all XHS entry points',async t=>{
 const {platformHold,assertPlatformAvailable}=await import('../lib/platform-holds.mjs');const {inboxStatus,updateInboxCommand}=await import('../lib/inbox-policy.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'platform-warning-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'platform-holds.json'),JSON.stringify({version:1,platforms:{xiaohongshu:{reason:'warning'}}}));
 const now=Date.parse('2026-11-07T11:00:00+08:00');updateInboxCommand({platform:'xiaohongshu',kind:'resume'},{root,now});assert.equal(inboxStatus('xiaohongshu',{root,now}).reason,'platform-warning');
 assert.equal(browseSelection('xiaohongshu',{root,now}).allowed,false);assert.throws(()=>assertPlatformAvailable('xiaohongshu',{root}),{code:'PLATFORM_HELD'});assert.equal(platformHold('douyin',{root}),null);
 for(const file of ['xhs.mjs','xhs-act.mjs','xhs-message.mjs','xhs-notifications.mjs','xhs-share.mjs'])assert.match(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),/assertPlatformAvailable\('xiaohongshu'\)/);
});
test('short looping clips count verified playback, source switches or backward seeks do not',async()=>{
 const {playbackProgress}=await import('../lib/incoming-media.mjs');const before={src:'same',time:14,duration:16,loop:true};
 assert.equal(playbackProgress(before,{src:'same',time:2}),4);assert.equal(playbackProgress(before,{src:'other',time:18}),0);assert.equal(playbackProgress({...before,loop:false},{src:'same',time:2}),0);
});
test('installed private-share path returns its observation before the autonomous gate',{skip:process.env.HUOHUO_NATIVE_TESTS!=='1'},async()=>{
 const {harness}=await import('../lib/runtime.mjs');const {pathToFileURL}=await import('node:url');const {ChatService}=await import(pathToFileURL(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/chat-service.mjs')));
 const method=ChatService.prototype.observeMessage.toString().replace(/const \{incomingOrNote\}=await import\([^\n]+\);/,'const incomingOrNote=readHelper;');
 const fn=Function('messagesOf','messageFingerprint','readHelper','return async function '+method.replace(/^async /,''))(s=>s.messages,m=>JSON.stringify(m),async()=>({frames:[{data:'fixture'}],understandingScope:'timed-video-sampling',note:'sampled'}));
 const message={id:'m',media:{type:'shared-work'}},context={readConversation:async()=>({messages:[message]}),browser:{captureMessage:async()=>({messageId:'m',frames:[]}),openSharedVideo:async()=>({url:'https://www.douyin.com/video/123',videoId:'123'})},videoLimits:{state(){throw Error('autonomous gate must not run')}}};
 const result=await fn.call(context,'peer','m');assert.equal(result.understandingScope,'timed-video-sampling');assert.equal(result.note,'sampled');assert.equal(result.frames.length,1);
});

test('buffering play promise never blocks readiness timeout, and rejected autoplay is handled',async()=>{
 const {requestPlayback}=await import('../lib/incoming-media.mjs');
 const pending={muted:false,play:()=>new Promise(()=>{})};
 assert.equal(requestPlayback(pending),undefined);assert.equal(pending.muted,true);
 assert.equal(requestPlayback({play:()=>Promise.reject(Error('autoplay denied'))}),undefined);
 await new Promise(resolve=>setImmediate(resolve));
});
