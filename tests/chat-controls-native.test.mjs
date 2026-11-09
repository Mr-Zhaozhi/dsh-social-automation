import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {harness} from '../lib/runtime.mjs';
const modules=path.join(harness,'profiles/web/node_modules'),dy=path.join(modules,'dsh-douyin-browser-local'),wx=path.join(modules,'dsh-wechat/dist/bridge/bridge.js');const url=p=>JSON.stringify(pathToFileURL(p).href);
function run(t,code){const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-control-native-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'.state/shared-context'),{recursive:true});fs.writeFileSync(path.join(root,'automation.json'),JSON.stringify({owner_qq:'123'}));fs.writeFileSync(path.join(root,'inbox-policy.json'),JSON.stringify({version:1,timeZone:'Asia/Shanghai',enabled:false,startMinute:600,endMinute:1440,platforms:{}}));fs.writeFileSync(path.join(root,'.state/shared-context/bindings.json'),JSON.stringify({owners:{qq:['123'],wechat:['wx-owner']}}));const r=spawnSync(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';import fs from 'node:fs';const root=process.env.HUOHUO_WORKSPACE;${code}`],{encoding:'utf8',timeout:15000,env:{...process.env,HUOHUO_WORKSPACE:root}});assert.equal(r.status,0,r.stderr||r.stdout);}
test('installed Douyin poll and autostart perform zero browser work during rest',{skip:!fs.existsSync(path.join(dy,'chat-service.mjs'))},t=>run(t,`
 import {ChatService} from ${url(path.join(dy,'chat-service.mjs'))};import {FriendInteractions} from ${url(path.join(dy,'friend-interactions.mjs'))};
 const trap=new Proxy({}, {get(){throw Error('browser or service accessed while resting');}});
 assert.equal(ChatService.prototype.requestPoll.call(trap),false);await ChatService.prototype.poll.call(trap);
 const friend={};await FriendInteractions.prototype.apply.call(friend);assert.equal(friend.status,'resting');
 const mark={pending:{phase:'model',incoming:[]}},self={persist(){},log(){}};
 const result=await ChatService.prototype.deliverReply.call(self,{id:'test'},mark,{text:'稍后接话'},[],new AbortController().signal);
 assert.equal(result.waiting,true);assert.equal(result.deliveryUncertain,false);assert.equal(mark.pending.phase,'outbound-wait');assert.equal(mark.pending.generatedText,'稍后接话');
`));
test('installed WeChat inbound changes real settings and sends confirmation before model path',{skip:!fs.existsSync(wx)},t=>run(t,`
 import {WeChatDSHBridge} from ${url(wx)};const replies=[];
 const self={peerUserId:'wx-owner',ensureBoundUser:()=>({userId:'wx-owner'}),persistOutboundState(){},notifyAllowlistSeed(){},sendReply:async(id,text)=>replies.push({id,text})};
 const msg=text=>({message_type:1,from_user_id:'wx-owner',context_token:'fixture',item_list:[{type:1,text_item:{text}}]});
 await WeChatDSHBridge.prototype.processMessage.call(self,msg('检查时间改成每天早上十一点到晚上十一点'));
 let settings=JSON.parse(fs.readFileSync(root+'/inbox-policy.json'));assert.equal(settings.startMinute,660);assert.equal(settings.endMinute,1380);assert.equal(replies[0].id,'wx-owner');assert.match(replies[0].text,/已更新/);
 await WeChatDSHBridge.prototype.processMessage.call(self,msg('恢复检查'));assert.equal(JSON.parse(fs.readFileSync(root+'/inbox-policy.json')).enabled,true);
 await WeChatDSHBridge.prototype.processMessage.call(self,msg('主动程度调到80'));assert.equal(JSON.parse(fs.readFileSync(root+'/interaction-policy.json')).level,80);
 await WeChatDSHBridge.prototype.processMessage.call(self,msg('主动聊天时间改成每天10:00到23:00'));
 await WeChatDSHBridge.prototype.processMessage.call(self,msg('叫我朋友'));
 const prefs=JSON.parse(fs.readFileSync(root+'/interaction-policy.json'));assert.equal(prefs.quietStart,23);assert.equal(prefs.quietEnd,10);assert.equal(prefs.nickname,'朋友');
`));
test('QQ original private messages use direct controls; group and quoted requests cannot change config',t=>run(t,`
 import {ownerControl} from ${JSON.stringify(new URL('../lib/companion-policy.mjs',import.meta.url).href)};const replies=[],ctx={call:async(method,args)=>{assert.equal(method,'send_private_msg');replies.push(args);}};
 const inbound={kind:'private',userId:'123',text:'恢复检查'};assert(await ownerControl(inbound,ctx));assert.equal(JSON.parse(fs.readFileSync(root+'/inbox-policy.json')).enabled,true);
 for(const extra of [{kind:'group'},{userId:'456'},{replyId:'quoted'},{forwardId:'forward'}])assert.equal(await ownerControl({...inbound,...extra,text:'暂停检查'},ctx),false);
 assert.equal(replies.length,1);assert.equal(JSON.parse(fs.readFileSync(root+'/inbox-policy.json')).enabled,true);
`));
test('QQ quick queries traverse installed native gates without starting or disrupting a model turn',{skip:!fs.existsSync(path.join(modules,'dsh-onebot-qq/lib/inbound.js'))},t=>run(t,`
 import {InboundPipeline,normalizeOneBot11} from ${url(path.join(modules,'dsh-onebot-qq/lib/inbound.js'))};
 import {quickQQHandler} from ${JSON.stringify(new URL('../lib/quick-query-routing.mjs',import.meta.url).href)};
 const config=JSON.parse(fs.readFileSync(root+'/automation.json'));config.voice={primary_profile:'jinx',profiles:{jinx:{},beijing:{}}};fs.writeFileSync(root+'/automation.json',JSON.stringify(config));
 const sent=[],chat={dispatchTimes:[],loopBuffer:['keep'],loopPending:'keep'};
 const ctx={config:{ignoreSelf:true,rateLimitPerMinute:1,notices:{rateLimited:false}},policy:{dmPolicy:'allowlist',allowFrom:['123'],adminUsers:['123']},selfId:()=> '321',log(){},sweepIdleChats:async()=>{},getChat:()=>chat,media:{cleanupExpired:async()=>{}},tryHandleCommand:async()=>false,buildBody:async text=>text,interceptQuestionAnswer:async()=>false,interceptBusyTurn:async()=>{throw Error('must not steer active task');},dispatchFollowup:async()=>{throw Error('must not invoke model');},call:async(method,payload)=>{assert.equal(method,'send_private_msg');sent.push(payload);}};
 const pipe=new InboundPipeline(ctx),wrapped=quickQQHandler(InboundPipeline.prototype.processInbound,{root});
 const message=id=>normalizeOneBot11({message_type:'private',user_id:123,message_id:id,message:[{type:'text',data:{text:'有哪些音色'}}],sender:{nickname:'owner'}});
 await wrapped.call(pipe,message(1));assert.equal(sent.length,1);assert.match(sent[0].message[0].data.text,/配置的固定音色/);assert.deepEqual(chat.loopBuffer,['keep']);assert.equal(chat.loopPending,'keep');
 await wrapped.call(pipe,message(1));assert.equal(sent.length,1);
 await wrapped.call(pipe,message(2));assert.equal(sent.length,1); // native rate limit
 chat.dispatchTimes=[];ctx.interceptQuestionAnswer=async()=>true;await wrapped.call(pipe,message(3));assert.equal(sent.length,1);
 ctx.policy.allowFrom=[];await wrapped.call(pipe,message(4));assert.equal(sent.length,1);
`));
test('WeChat quick queries pass real peer/context/card handling before a deterministic reply',{skip:!fs.existsSync(wx)},t=>run(t,`
 import {WeChatDSHBridge} from ${url(wx)};
 import {quickWeChatHandlers} from ${JSON.stringify(new URL('../lib/quick-query-routing.mjs',import.meta.url).href)};
 const config=JSON.parse(fs.readFileSync(root+'/automation.json'));config.voice={primary_profile:'jinx',profiles:{jinx:{}}};fs.writeFileSync(root+'/automation.json',JSON.stringify(config));
 const p=WeChatDSHBridge.prototype,replies=[];const wrapped=quickWeChatHandlers(p.processMessage,p.tryNativeCommand,{root});
 const self={peerUserId:'wx-owner',ensureBoundUser:()=>({userId:'wx-owner'}),persistOutboundState(){},notifyAllowlistSeed(){},sendReply:async(id,text)=>replies.push({id,text}),log(){},passthroughActive:()=>false,isBypassableNativeCommand:()=>false,answerableApprovals:()=>[],answerableQuestions:()=>[],pendingCardsForCurrentSession:()=>({approvals:[],questions:[]}),isCardCloseCommand:()=>false,outboundCache:[],previewMessage:()=>'',audit:{record(){}},tryNativeCommand:wrapped.tryNativeCommand,enqueueInbound:()=>{throw Error('must not start model');}};
 const msg=id=>({message_type:1,from_user_id:id,context_token:'new-context',item_list:[{type:1,text_item:{text:'有哪些音色'}}]});
 await wrapped.processMessage.call(self,msg('other'));assert.equal(replies.length,0);
 await wrapped.processMessage.call(self,msg('wx-owner'));assert.equal(replies.length,1);assert.match(replies[0].text,/配置的固定音色/);assert.equal(self.wireContextToken,'new-context');
`));
test('installed QQ native pipeline dispatches the missed new-group invitation without relaxing other groups',{skip:!fs.existsSync(path.join(modules,'dsh-onebot-qq/lib/inbound.js'))},t=>run(t,`
 import {InboundPipeline,normalizeOneBot11} from ${url(path.join(modules,'dsh-onebot-qq/lib/inbound.js'))};
 import {groupRouting} from ${JSON.stringify(new URL('../lib/group-routing.mjs',import.meta.url).href)};
 const cfg=JSON.parse(fs.readFileSync(root+'/automation.json'));cfg.qq_groups={'456':{enabled:true,aliases:['小伴']}};fs.writeFileSync(root+'/automation.json',JSON.stringify(cfg));
 const dispatched=[],ctx={config:{ignoreSelf:true,requireMention:true,rateLimitPerMinute:0},policy:{groupPolicy:'allowlist',groupAllowFrom:[],adminUsers:['123']},selfId:()=> '321',log(){},sweepIdleChats:async()=>{},getChat:()=>undefined,media:{cleanupExpired:async()=>{}},tryHandleCommand:async()=>false,buildBody:async text=>text,interceptQuestionAnswer:async()=>false,interceptBusyTurn:async()=>false,dispatchFollowup:async(...args)=>dispatched.push(args),call:async()=>{throw Error('direct invitation must not need history or model classifier');}};
 const pipe=new InboundPipeline(ctx),wrapped=groupRouting(InboundPipeline.prototype.processInbound,{root});
 const msg=(id,text,group=456)=>normalizeOneBot11({message_type:'group',group_id:group,user_id:123,message_id:id,message:[{type:'text',data:{text}}],sender:{nickname:'owner'}});
 await wrapped.call(pipe,msg(1,'小伴出来聊天呀'));await wrapped.call(pipe,msg(2,'霍霍出来聊天'));assert.equal(dispatched.length,2);assert.equal(ctx.config.requireMention,true);
 await wrapped.call(pipe,msg(2,'霍霍出来聊天'));await wrapped.call(pipe,msg(3,'小伴出来聊天',999));assert.equal(dispatched.length,2);
`));
test('installed QQ attention gate handles about-bot context only after native dedup and authorization',{skip:!fs.existsSync(path.join(modules,'dsh-onebot-qq/lib/inbound.js'))},t=>run(t,`
 import {InboundPipeline,normalizeOneBot11} from ${url(path.join(modules,'dsh-onebot-qq/lib/inbound.js'))};
 import {attentionRouting} from ${JSON.stringify(new URL('../lib/group-attention.mjs',import.meta.url).href)};
 const cfg=JSON.parse(fs.readFileSync(root+'/automation.json'));cfg.qq_groups={'456':{enabled:true,aliases:['小伴'],proactive_join:true}};fs.writeFileSync(root+'/automation.json',JSON.stringify(cfg));
 let models=0;const sent=[],chat={dispatchTimes:[],loopBuffer:['keep'],loopPending:'keep'};
 const ctx={config:{ignoreSelf:true,requireMention:true,rateLimitPerMinute:30},policy:{groupPolicy:'allowlist',groupAllowFrom:[],adminUsers:['123']},selfId:()=> '321',log(){},sweepIdleChats:async()=>{},getChat:()=>chat,media:{cleanupExpired:async()=>{}},tryHandleCommand:async()=>false,buildBody:async t=>t,interceptQuestionAnswer:async()=>false,interceptBusyTurn:async()=>false,dispatchFollowup:async(...args)=>sent.push(args),call:async()=>({messages:[]})};
 const pipe=new InboundPipeline(ctx),wrapped=attentionRouting(InboundPipeline.prototype.processInbound,{readPolicy:id=>cfg.qq_groups[id],decide:async()=>{models++;return {aboutBot:true,participate:true,confidence:.97};}});
 const msg=(id,text,group=456)=>normalizeOneBot11({message_type:'group',group_id:group,user_id:123,message_id:id,message:[{type:'text',data:{text}}],sender:{nickname:'owner'}});
 await wrapped.call(pipe,msg(1,'在吗锅爷'));assert.equal(sent.length,1);assert.equal(models,0);
 await wrapped.call(pipe,msg(2,'刚才锅爷接梗还挺快'));assert.equal(sent.length,2);assert.equal(models,1);
 await wrapped.call(pipe,msg(2,'刚才锅爷接梗还挺快'));await wrapped.call(pipe,msg(3,'刚才锅爷接梗还挺快',999));assert.equal(models,1);assert.equal(sent.length,2);
 await wrapped.call(pipe,msg(4,'锅爷先别回复'));assert.equal(sent.length,2);assert.deepEqual(chat.loopBuffer,['keep']);assert.equal(ctx.config.requireMention,true);
`));
