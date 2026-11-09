import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {harness} from '../lib/runtime.mjs';
const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
function run(t,body){const root=fs.mkdtempSync(path.join(os.tmpdir(),'passive-inbox-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(root+'/automation.json','{}');const pre=`import assert from 'node:assert/strict';import fs from 'node:fs';import {noteIncoming,chatCanPoll,runInboxPoll,passiveRecipient,clearPassive} from './lib/passive-inbox.mjs';import {inboxAllowed,assertInboxAllowed} from './lib/inbox-policy.mjs';const root=process.env.HUOHUO_WORKSPACE;const policy={version:1,timeZone:'Asia/Shanghai',enabled:true,startMinute:600,endMinute:1440,platforms:{}};const save=()=>fs.writeFileSync(root+'/inbox-policy.json',JSON.stringify(policy));save();let clock=Date.parse('2026-11-08T00:30:00+08:00');Date.now=()=>clock;const service={running:true,abort:new AbortController(),policy:{allowlist:[{id:'owner'},{id:'friend'}]},watermarks:{contacts:{}}};`;
const r=spawnSync(process.execPath,['--input-type=module','-e',pre+body],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,HUOHUO_WORKSPACE:root},encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr||r.stdout);}
test('night timers do no work; observed authorized incoming opens only its scoped reply',t=>run(t,`
 let calls=0;assert(!chatCanPoll(service));await runInboxPoll(service,()=>calls++);assert.equal(calls,0);assert(!noteIncoming(service,'stranger'));assert(noteIncoming(service,'owner'));assert(chatCanPoll(service));assert(!inboxAllowed('douyin'));
 await runInboxPoll(service,async()=>{calls++;assert.equal(passiveRecipient(),'owner');assert(inboxAllowed('douyin'));assert(!inboxAllowed('xiaohongshu'));assertInboxAllowed('douyin');await Promise.resolve();assert.equal(passiveRecipient(),'owner');service.watermarks.contacts.owner={lastCheckedAt:new Date(clock).toISOString()};});
 assert.equal(calls,1);assert(!chatCanPoll(service));assert(!inboxAllowed('douyin'));
`));
test('pause, timed pause, revoked contact, expiry and stopped service cannot gain a night exemption',t=>run(t,`
 assert(noteIncoming(service,'owner'));policy.enabled=false;save();assert(!chatCanPoll(service));await runInboxPoll(service,()=>{throw Error('paused');});policy.enabled=true;policy.pausedUntil=new Date(clock+60000).toISOString();save();assert(!noteIncoming(service,'owner'));assert(!chatCanPoll(service));delete policy.pausedUntil;save();service.policy.allowlist=[];assert(!chatCanPoll(service));service.policy.allowlist=[{id:'owner'}];noteIncoming(service,'owner');clock+=360001;assert(!chatCanPoll(service));service.running=false;assert(!noteIncoming(service,'owner'));
`));
test('busy wakes survive, retries are bounded, and a newer event is not consumed by the old read',t=>run(t,`
 noteIncoming(service,'owner');service.busy=true;await runInboxPoll(service,()=>{throw Error('busy');});assert(chatCanPoll(service));service.busy=false;
 await runInboxPoll(service,()=>{noteIncoming(service,'owner');service.watermarks.contacts.owner={lastCheckedAt:new Date(clock).toISOString()};});assert(chatCanPoll(service));clearPassive(service);delete service.watermarks.contacts.owner;
 noteIncoming(service,'owner');let calls=0;for(let i=0;i<8;i++){await runInboxPoll(service,()=>calls++);clock+=11000;}assert.equal(calls,3);assert(!chatCanPoll(service));
`));
test('native polling filters night reads to the notified contact without unread enumeration or old backlog',{skip:process.env.HUOHUO_NATIVE_TESTS!=='1'},t=>run(t,`
 const {ChatService}=await import(${JSON.stringify('file://'+pkg+'/chat-service.mjs')});
 fs.mkdirSync(root+'/native',{recursive:true});fs.writeFileSync(root+'/native/friend-interactions-policy.json',JSON.stringify({version:1,enabled:true}));
 const read=[];Object.assign(service,{stateDir:root+'/native',runId:'test',assertOwned(){},incomingPriority:new Set(),autoDue:()=>false,persist(){},log(){},startGroupVideos(){},requestPoll(){},browser:{unreadCounts(){throw Error('must not enumerate');},async readConversation(id){read.push(id);throw Object.assign(Error('foreground'),{code:'CHAT_FOREGROUND'});}},watermarks:{contacts:{owner:{status:'ready'},friend:{status:'ready'}}}});
 service.pollInbox=ChatService.prototype.pollInbox;noteIncoming(service,'owner');await ChatService.prototype.poll.call(service);assert.deepEqual(read,['owner']);assert.equal(service.watermarks.contacts.friend.lastCheckedAt,undefined);
 await runInboxPoll(service,()=>ChatService.prototype.processAutoBacklog.call({},null,null,null,null,{throwIfAborted(){throw Error('old backlog must not run');}}));
`));
test('installed DOM observer wakes for new incoming rows with no badge, never old rows or outgoing text',async()=>{
 const {runInNewContext}=await import('node:vm');const{ChatBrowser}=await import('file://'+pkg+'/chat-browser.mjs');
 let observer;const messages=[],notifications=[],timers=[];const root={};
 class Element{constructor(out=false){this.out=out;this.parentElement=root;this.classList=new Set(['messageMessageBoxmessageBox',...(out?['messageMessageContentisFromMe']:[])]);this.classList.contains=this.classList.has.bind(this.classList);}getAttribute(k){return k==='data-direction'?(this.out?'outgoing':'incoming'):null;}closest(s){return s.includes('im-dialog')?root:this;}matches(){return false;}querySelector(){return null;}}
 messages.push(new Element());
 const document={body:{},querySelectorAll:s=>s.includes('conversation-item')?[]:messages};const window={};
 const page={isClosed:()=>false,exposeBinding:async name=>{window[name]=async(token,id)=>notifications.push(id);},evaluate:async(fn,args)=>{
  if(String(fn).includes('MutationObserver'))return runInNewContext('('+fn.toString()+')(args)',{args,document,window,Element,MutationObserver:class{constructor(cb){observer=cb;}observe(){}disconnect(){}},setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 }};
 const self={withPage:fn=>fn(page),dialog:async()=>({}),incomingHandlers:new Map(),incomingCleanup:new Set(),incomingPages:new WeakSet(),incomingBinding:'wake',contacts:new Map()};
 await ChatBrowser.prototype.subscribeIncoming.call(self,()=>{}, {recipientIds:['conv:'+'a'.repeat(64)]});
 const mutate=node=>{observer([{target:node,type:'childList',addedNodes:[node],removedNodes:[]}]);timers.pop()?.();};
 mutate(messages[0]);assert.deepEqual(notifications,[]);
 messages.push(new Element(true));mutate(messages.at(-1));assert.deepEqual(notifications,[]);
 messages.push(new Element());mutate(messages.at(-1));assert.deepEqual(notifications,['current']);
 mutate(messages.at(-1));assert.deepEqual(notifications,['current']);
});
