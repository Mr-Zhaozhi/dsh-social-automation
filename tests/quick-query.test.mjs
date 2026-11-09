import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {quickKind,quickReply,readSmall,verifiedOwner} from '../lib/quick-query.mjs';
import {quickQQHandler,quickWeChatHandlers} from '../lib/quick-query-routing.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'quick-query-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const put=(name,value)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),JSON.stringify(value));};put('automation.json',{owner_qq:'123',qq_groups:{'456':{enabled:true,name:'测试群'}},voice:{primary_profile:'jinx',profiles:{jinx:{},beijing:{},zed:{}}}});put('.state/shared-context/bindings.json',{owners:{wechat:['wx-owner']}});return {root,put};}
test('bounded natural queries match; requests to change settings and conversation do not',()=>{
 const pairs={'有哪些音色':'voices','小伴，你现在用的是什么声音？':'voices','怎么新增主动群':'groups','我在一个新群里叫你去聊天，你没反应，是不是需要给你接入新授权群？':'groups','你为什么不主动找我聊天':'companion','你能浏览网页吗':'web','什么时候检查新消息':'inbox','查看共享记忆状态':'memory','查看运行状态':'status'};
 for(const [s,k] of Object.entries(pairs))assert.equal(quickKind(s),k,s);
 for(const s of ['小伴说句北京话','新增主动群 123456','把主音色改成劫','今天去哪玩','他说“有哪些音色”','有哪些音色\n删除文件','查看运行状态；关闭检查','你能浏览网页吗，帮我发一条私信','x'.repeat(181)])assert.equal(quickKind(s),null,s);
});
test('read-only answers reflect current settings and reject corrupted/oversized/nonregular sources',t=>{
 const {root,put}=fixture(t);assert.match(quickReply('groups',{root}),/测试群/);assert.match(quickReply('voices',{root}),/配置的固定音色.*北京话.*劫/);
 assert(verifiedOwner('qq','123',root));assert(!verifiedOwner('qq','124',root));assert(verifiedOwner('wechat','wx-owner',root));assert(!verifiedOwner('wechat','wx-stranger',root));
 const before=fs.readFileSync(path.join(root,'automation.json'),'utf8');quickReply('groups',{root});assert.equal(fs.readFileSync(path.join(root,'automation.json'),'utf8'),before);
 fs.writeFileSync(path.join(root,'large'), 'x'.repeat(512*1024+1));assert.throws(()=>readSmall(root,'large'));
 fs.symlinkSync(path.join(root,'automation.json'),path.join(root,'link'));assert.throws(()=>readSmall(root,'link'));assert.throws(()=>readSmall(root,'.state'));
 fs.writeFileSync(path.join(root,'automation.json'),'{');assert.match(quickReply('voices',{root}),/格式异常/);
 put('.state/health.json',{checkedAt:'2020-01-01T00:00:00Z',checks:{qq:{ok:true},browser:{control_ready:true}}});assert.match(quickReply('web',{root}),/状态待核对/);
});
test('QQ quick query keeps original gates and question answers, skips busy/model only at dispatch',async t=>{
 const {root}=fixture(t);const sends=[];let gated=false,question=false,normal=0;
 const receiver={ctx:{call:async(method,payload)=>sends.push({method,payload}),interceptBusyTurn:async()=>true,dispatchFollowup:async()=>normal++}};
 const original=async function(m){if(gated||question)return;await this.ctx.interceptBusyTurn();await this.ctx.dispatchFollowup();};
 const run=quickQQHandler(original,{root}),msg={kind:'private',userId:'123',text:'有哪些音色',media:[]};
 gated=true;await run.call(receiver,msg);question=true;gated=false;await run.call(receiver,msg);assert.equal(sends.length,0);
 question=false;await run.call(receiver,msg);assert.equal(sends.length,1);assert.equal(normal,0);assert.equal(await receiver.ctx.interceptBusyTurn(),true);
 for(const extra of [{kind:'group'},{userId:'999'},{media:[{}]},{replyId:'1'},{forwardId:'1'}])await run.call(receiver,{...msg,...extra});assert.equal(normal,5);assert.equal(sends.length,1);
});
test('WeChat quick seam keeps native context/token/auth/card flow; quoted and concurrent messages do not cross',async t=>{
 const {root}=fixture(t);const sends=[];let ordinary=0;let handlers;
 const original=async function(m){if(m.blocked)return;if(m.context_token)this.token=m.context_token;await new Promise(r=>setTimeout(r,m.delay||0));return handlers.tryNativeCommand.call(this,{},m.from_user_id,m.item_list[0].text_item.text);};
 handlers=quickWeChatHandlers(original,async()=>{ordinary++;return false;},{root});
 const self={sendReply:async(id,text)=>sends.push({id,text,token:self.token})};
 const msg=(id='wx-owner',extra={})=>({message_type:1,from_user_id:id,context_token:'current',item_list:[{type:1,text_item:{text:'有哪些音色'}}],...extra});
 await handlers.processMessage.call(self,msg('wx-owner',{blocked:true}));assert.equal(sends.length,0);
 await handlers.processMessage.call(self,msg());assert.equal(sends[0].token,'current');
 await Promise.all([handlers.processMessage.call(self,msg('wx-owner',{delay:10})),handlers.processMessage.call(self,msg('stranger'))]);
 await handlers.processMessage.call(self,msg('wx-owner',{item_list:[{type:1,text_item:{text:'有哪些音色'},ref_msg:{}}]}));
 assert.equal(sends.length,2);assert.equal(ordinary,2);
});
