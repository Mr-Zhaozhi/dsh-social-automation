import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {discoveryDue,observeMood,scopedMood,lifeContext,repeatTopic,voiceChoice} from '../lib/life-state.mjs';
import {eligibility} from '../lib/companion-policy.mjs';import {proactiveProblem} from '../lib/companion-content.mjs';
import {SharedContext} from '../lib/shared-context.mjs';
const now=Date.parse('2026-11-08T05:00:00Z');
test('exploration reserves failed attempts, waits four hours and sleeps at night',()=>{
 assert(discoveryDue({},now));assert(!discoveryDue({attempts:[{at:now-10000,date:'2026-11-08',status:'failed'}]},now));
 assert(!discoveryDue({attempts:[{at:now-8*3600000,date:'2026-11-08'},{at:now-4*3600000,date:'2026-11-08'}]},now));
 assert(!discoveryDue({},Date.parse('2026-11-08T16:00:00Z')));
});
test('voice counts toward two unanswered across midnight; owner return reopens',()=>{
 const prefs={level:90,quietStart:23,quietEnd:9},sends=[{at:now-20*3600000,date:'2026-11-07',status:'confirmed',format:'voice'},{at:now-18*3600000,date:'2026-11-07',status:'confirmed'}];
 assert.equal(eligibility({sends,lastOwnerAt:now-24*3600000},prefs,now,'2026-11-08').reason,'waiting-owner');
 assert(eligibility({sends,lastOwnerAt:now-3600000},prefs,now,'2026-11-08').due);
 assert(!voiceChoice({format:'voice'},{history:[{speaker:'朋友',text:'开会，不方便听'}],now}));
 assert(!voiceChoice({format:'voice'},{sends:[{at:now-10000,format:'voice',status:'unknown'}],now}));
 assert(voiceChoice({format:'voice'},{sends:[],now}));
});
test('moods persist per scope, decay, and never punish silence or leak owner messages',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-life-'));
 try{
 observeMood(root,{scope:'owner'},{id:'1',role:'user',text:'谢谢你真可爱，我的秘密是123',at:now});
 assert.equal(scopedMood(root,'owner',now).tone,'开心');assert.equal(scopedMood(root,'group:qq:1',now).tone,'平静');
 assert(scopedMood(root,'owner',now+3600000).intensity<.6);assert.equal(scopedMood(root,'owner',now+5*3600000).tone,'平静');
 assert(!JSON.stringify(lifeContext(root,'owner')).includes('秘密'));
 const ctx=new SharedContext({root,home:root,now:()=>now});assert(!ctx.render(ctx.route('qq','123',{publicChat:true})).includes('秘密'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('source claims require fresh evidence and repetitive openers are filtered',()=>{
 const text='我刚看到一个星空拍摄点子，想研究它怎么拍的。';
 assert.equal(proactiveProblem(text),'unverified-source');
 const evidence=[{id:'star',status:'observed-web',at:Date.now()}];assert.equal(proactiveProblem(text,{evidence,sourceId:'star'}),null);
 assert.equal(proactiveProblem(text,{evidence,sourceId:'made-up'}),'unverified-source');
 assert(repeatTopic('朋友，今天想给封面起个标题，还没想出来。',['今天想给封面起个标题，还没想出来。']));
 assert(!repeatTopic('星云的颜色有时是观测数据的翻译。',['今天想给封面起个标题，还没想出来。']));
});
test('verified owner return on WeChat resumes the shared silence clock; strangers do not',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-return-'));
 try{
 fs.mkdirSync(path.join(root,'.state/shared-context'),{recursive:true});fs.writeFileSync(path.join(root,'.state/shared-context/bindings.json'),JSON.stringify({owners:{wechat:['owner-wx']}}));
 const ctx=new SharedContext({root,home:root,now:()=>now});
 ctx.record(ctx.route('wechat','stranger'),{id:'s',role:'user',text:'hi',at:now});assert(!fs.existsSync(path.join(root,'.state/companion.json')));
 ctx.record(ctx.route('wechat','owner-wx'),{id:'o',role:'user',text:'忙完了',at:now});assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.state/companion.json'))).lastOwnerAt,now);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('source extraction can exclude all shared memories from the actual model request',async()=>{
 const {modelJSON}=await import('../lib/model.mjs');let request;
 const ctx={agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},llm:{resolveModelInfo:async()=>({}),async *stream(r){request=r;yield {type:'text-delta',text:'{"observation":"only-source"}'};yield {type:'finish',reason:{kind:'stop'}};}}};
 const result=await modelJSON(ctx,'Extract source only',{source:'game jam source'},{useSharedContext:false,recordUsage:()=>{}});
 assert.equal(result.observation,'only-source');assert.equal(request.messages[0].content.length,1);assert.deepEqual(JSON.parse(request.messages[0].content[0].text),{source:'game jam source'});
});
test('public reading reaches the article beyond a large head without changing shared limits',async()=>{
 const {readPublicBody}=await import('../lib/public-reading.mjs');
 class Provider{constructor(){this.limits={maxBodyChars:100000,maxResponseBytes:5000000};}followAndRead(){}async fetch(){return {statusCode:200,body:{kind:'html',content:('<head>'+'x'.repeat(110000)+'</head><main>'+'scientific fact '.repeat(80)+'</main>').slice(0,this.limits.maxBodyChars)}};}}
 const p=new Provider();const text=await readPublicBody({selectFetchProvider:()=>p},'https://science.nasa.gov/',r=>r.body.content);
 assert(text.startsWith('<main>'));assert(!text.includes('<head>'));assert.equal(p.limits.maxBodyChars,100000);
 await assert.rejects(readPublicBody({selectFetchProvider:()=>({fetch:async()=>({statusCode:200,body:{kind:'html',content:'<head>title</head>'}})})},'https://science.nasa.gov/',r=>r.body.content),/正文/);
});
