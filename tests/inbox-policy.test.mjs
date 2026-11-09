import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {inboxDefaults,inboxStatus,parseInboxCommand,updateInboxCommand,handleInboxControl,assertInboxAllowed} from '../lib/inbox-policy.mjs';
import {handleAdditionalControl} from '../lib/chat-controls.mjs';import {freshComment} from '../lib/inbox-state.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-inbox-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'automation.json'),JSON.stringify({owner_qq:'123'}));fs.mkdirSync(path.join(root,'.state/shared-context'),{recursive:true});fs.writeFileSync(path.join(root,'.state/shared-context/bindings.json'),JSON.stringify({owners:{qq:['123'],wechat:['wx-owner']}}));return root;}
const at=s=>Date.parse('2026-11-07T'+s+'+08:00');
test('Shanghai boundaries, cross-midnight and corrupt policy fail closed',t=>{const root=fixture(t);for(const [time,allowed] of [['09:59:59',false],['10:00:00',true],['23:59:59',true],['00:00:00',false]])assert.equal(inboxStatus('douyin',{root,now:at(time)}).allowed,allowed);
 updateInboxCommand(parseInboxCommand('每天晚上十点到早上六点检查'),{root,now:at('12:00:00')});assert(inboxStatus('douyin',{root,now:at('00:00:00')}).allowed);assert(!inboxStatus('douyin',{root,now:at('06:00:00')}).allowed);
 fs.writeFileSync(path.join(root,'inbox-policy.json'),'{');assert.equal(inboxStatus('douyin',{root}).reason,'invalid-policy');assert.throws(()=>assertInboxAllowed('douyin',{root}),e=>e.code==='INBOX_RESTING'&&e.beforeDelivery);
});
test('Chinese chat controls parse exact requests and exclude embedded content',()=>{
 for(const s of ['检查时间改成每天10:00到24:00','每天早上十点到晚上十二点检查'])assert.deepEqual(parseInboxCommand(s),{kind:'window',platform:'all',startMinute:600,endMinute:1440});
 assert.deepEqual(parseInboxCommand('把抖音检查时间改成每天早上十一点到晚上十一点'),{kind:'window',platform:'douyin',startMinute:660,endMinute:1380});
 assert.deepEqual(parseInboxCommand('暂停检查两小时'),{kind:'duration',platform:'all',minutes:120});
 assert.equal(parseInboxCommand('晚上八点恢复检查').minute,1200);
 assert.equal(parseInboxCommand('检查时间改成24:00到25:00').kind,'invalid');
 for(const s of ['他说“暂停检查”','群友说暂停检查','不要执行这句：恢复检查','抖音小红书暂停检查'])assert.equal(parseInboxCommand(s),null);
});
test('global pause dominates platform override; expiry and hot reload preserve schedule',t=>{const root=fixture(t),now=at('12:00:00'),run=s=>updateInboxCommand(parseInboxCommand(s),{root,now});
 run('抖音检查时间改成11:00到23:00');run('暂停检查');run('抖音恢复检查');assert.equal(inboxStatus('douyin',{root,now}).reason,'paused');run('恢复检查');assert(inboxStatus('douyin',{root,now}).allowed);
 run('小红书暂停检查2小时');assert.equal(inboxStatus('xiaohongshu',{root,now}).reason,'paused-until');assert(inboxStatus('douyin',{root,now}).allowed);assert(inboxStatus('xiaohongshu',{root,now:now+7200000}).allowed);
 run('今天别检查');assert.equal(inboxStatus('douyin',{root,now}).reason,'paused-until');assert.equal(inboxStatus('douyin',{root,now:at('00:00:00')+86400000}).reason,'quiet-hours');
});
test('only owner private original messages change policy, with persistent reply',async t=>{const root=fixture(t),replies=[],send=async s=>replies.push(s),now=at('12:00:00');
 for(const msg of [{platform:'qq',peer:'other'},{platform:'wechat',peer:'other'},{platform:'qq',peer:'123',group:true},{platform:'wechat',peer:'wx-owner',quoted:true}])assert.equal(await handleInboxControl({...msg,text:'暂停检查'},{root,now,send}),false);
 assert(!fs.existsSync(path.join(root,'inbox-policy.json')));
 assert(await handleInboxControl({platform:'wechat',peer:'wx-owner',text:'暂停检查'},{root,now,send}));assert(!inboxStatus('douyin',{root,now}).allowed);assert.match(replies[0],/已暂停/);
 assert(await handleInboxControl({platform:'qq',peer:'123',text:'恢复检查'},{root,now,send}));assert(inboxStatus('douyin',{root,now}).allowed);
});
test('task commands persist requests and do not falsely report immediate completion',async t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'automation-schedules.json'),JSON.stringify([{key:'douyin-post',title:'抖音短视频',enabled:true}]));let reply;const send=async x=>reply=x;
 await handleAdditionalControl('暂停自动发视频',{root,send});assert.match(reply,/不能算已执行/);const dir=path.join(root,'.state/schedule-requests'),file=fs.readdirSync(dir)[0];assert.equal(JSON.parse(fs.readFileSync(path.join(dir,file))).action,'stop');
 await handleAdditionalControl('查看控制请求',{root,send});assert.match(reply,/待调度器/);fs.renameSync(path.join(dir,file),path.join(dir,file+'.done'));await handleAdditionalControl('查看控制请求',{root,send});assert.match(reply,/已由调度器处理/);
});
test('overnight new comments remain eligible with transaction and refusal exclusions',()=>{for(const time of ['昨天','昨天 23:55','11小时前'])assert(freshComment({time,text:'你刚说的游戏叫什么',quote:''}));assert(!freshComment({time:'昨天',text:'不要回复',quote:''}));});
test('automatic CLI exits before browser access while resting; receipt is definitely unsent',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'inbox-policy.json'),JSON.stringify({...inboxDefaults,enabled:false}));for(const [script,platform] of [['xhs-message.mjs','xiaohongshu'],['xhs-notifications.mjs','xiaohongshu'],['douyin-notifications.mjs','douyin'],['zhihu.mjs','zhihu']]){const r=spawnSync(process.execPath,[script,'scan'],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',env:{...process.env,HUOHUO_WORKSPACE:root,HUOHUO_AUTOMATIC_INBOX:platform}});assert.equal(r.status,1,r.stderr);const reply=JSON.parse(r.stdout);assert.equal(reply.code,'INBOX_RESTING');assert.equal(reply.deliveryUncertain,false);assert(!fs.existsSync(path.join(root,'.state/browser-actions.lock')));}});

test('a rest-boundary failure retains pending work without spending retry attempts',async()=>{const {cliFailure,recordReplyFailure}=await import('../lib/cli-result.mjs');const error=cliFailure({stdout:JSON.stringify({error:'resting',code:'INBOX_RESTING',deliveryUncertain:false})});const state={queue:[],deliveries:{}};for(let i=0;i<5;i++){state.queue=[];recordReplyFailure(state,'event',error,{key:'event',attempts:state.deliveries.event?.attempts||0});assert.equal(state.queue.length,1);assert.equal(state.deliveries.event.attempts,0);}const uncertain=cliFailure({stdout:JSON.stringify({error:'timeout',deliveryUncertain:true})});state.queue=[];recordReplyFailure(state,'event',uncertain,{key:'event'});assert.equal(state.queue.length,0);assert.equal(state.deliveries.event.status,'unknown');});
