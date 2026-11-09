import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parseGroupCommand,applyGroupCommand} from '../lib/group-commands.mjs';
import {directAddress} from '../lib/group-dialogue.mjs';
import {groupRouting,groupWeChatRouting} from '../lib/group-routing.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'group-control-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'automation.json');fs.writeFileSync(file,JSON.stringify({owner_qq:'123',voice:{id:'keep'},qq_groups:{'456':{enabled:true,aliases:['小伴','小祸'],context_seconds:300}}}));fs.mkdirSync(path.join(root,'.state/shared-context'),{recursive:true});fs.writeFileSync(path.join(root,'.state/shared-context/bindings.json'),JSON.stringify({owners:{wechat:['wx-owner']}}));return {root,file};}
test('natural group controls accept explicit single actions, never quoted or ambiguous commands',()=>{
 for(const text of ['给测试兴趣二群加入主动群','把测试兴趣二群加入主动群吧','让测试兴趣二群加入主动群','新增主动群 测试兴趣二群'])assert.deepEqual(parseGroupCommand(text),{kind:'group',target:'测试兴趣二群',enabled:true});
 for(const text of ['关闭主动群 456','把456移出主动群','将456从主动群中移除'])assert.deepEqual(parseGroupCommand(text),{kind:'group',target:'456',enabled:false});
 for(const text of ['能不能把测试兴趣二群加入主动群？','他说“给测试兴趣二群加入主动群”','给测试兴趣二群加入主动群\n关闭别的群','给测试兴趣二群加入主动群然后退群','小伴出来聊天呀'])assert.equal(parseGroupCommand(text),null);
});
test('direct chat invitations and spoken-name variant wake without matching third-person statements',()=>{
 for(const text of ['小伴出来聊天呀','霍霍出来聊天','小伴出来','小伴陪我聊会儿','小伴聊聊天','小伴醒醒','嘿，霍霍说句北京话'])assert(directAddress(text,['小伴']),text);
 for(const text of ['我叫小伴出来聊天','小伴出来的效果很好','小伴说过这个','小伴发的图','霍霍说他不在'])assert(!directAddress(text,['小伴']),text);
 assert(!directAddress('霍霍出来聊天',['另外一个名字']));
});
test('group save preserves concurrent changes/custom aliases; unknown/duplicate/timeout never claim success',async t=>{
 const {root,file}=fixture(t),cmd={kind:'group',target:'测试兴趣二群',enabled:true};
 const reply=await applyGroupCommand(cmd,{root,call:async()=>{const c=JSON.parse(fs.readFileSync(file));c.voice.id='newer';fs.writeFileSync(file,JSON.stringify(c));return [{group_id:456,group_name:cmd.target}];}});
 assert.match(reply,/已开启/);const c=JSON.parse(fs.readFileSync(file));assert.equal(c.voice.id,'newer');assert.equal(c.qq_groups['456'].context_seconds,300);assert.deepEqual(c.qq_groups['456'].aliases,['小伴','小祸','霍霍']);
 const before=fs.readFileSync(file,'utf8');for(const groups of [[],[{group_id:456,group_name:cmd.target},{group_id:789,group_name:cmd.target}]])assert.match(await applyGroupCommand(cmd,{root,call:async()=>groups}),/没有修改/);
 assert.match(await applyGroupCommand(cmd,{root,timeoutMs:5,call:()=>new Promise(()=>{})}),/没有修改/);assert.equal(fs.readFileSync(file,'utf8'),before);
 assert.match(await applyGroupCommand({...cmd,enabled:false},{root,call:async()=>[{group_id:456,group_name:cmd.target}]}),/没有退出QQ群/);assert.equal(JSON.parse(fs.readFileSync(file)).qq_groups['456'].enabled,false);
});
test('live QQ adapter preserves native gating; only owner plain control can write',async t=>{
 const {root,file}=fixture(t),sends=[];let model=0,blocked=false;
 const chat={loopBuffer:['keep'],loopPending:'keep'};
 const self={ctx:{config:{requireMention:true},selfId:()=> '321',getChat:()=>chat,call:async(method,args)=>method==='get_group_list'?[{group_id:789,group_name:'新群'}]:sends.push(args),dispatchFollowup:async()=>model++}};
 const run=groupRouting(async function(msg){if(blocked)return;if(msg.kind==='group'){assert.equal(this.ctx.config.requireMention,false);return;}this.ctx.getChat().loopBuffer=[];await this.ctx.dispatchFollowup();},{root});
 const msg={kind:'private',userId:'123',text:'给新群加入主动群',media:[]};blocked=true;await run.call(self,msg);assert.equal(sends.length,0);blocked=false;
 await run.call(self,msg);assert.equal(sends.length,1);assert.equal(model,0);assert.deepEqual(chat.loopBuffer,['keep']);assert(JSON.parse(fs.readFileSync(file)).qq_groups['789'].enabled);
 await run.call(self,{kind:'group',groupId:'789',userId:'123',text:'霍霍出来聊天',segments:[]});assert.equal(self.ctx.config.requireMention,true);
 for(const extra of [{userId:'999'},{replyId:'1'},{forwardId:'1'},{media:[{}]}])await run.call(self,{...msg,...extra});assert.equal(model,4);assert.equal(sends.length,1);
});
test('WeChat natural controls use native peer/token path and reject quoted controls',async t=>{
 const {root}=fixture(t),sent=[];let fallback=0,wrap;
 wrap=groupWeChatRouting(async function(m){return wrap.tryNativeCommand.call(this,{},m.from_user_id,m.item_list[0].text_item.text);},async()=>{fallback++;return false;},{root,call:async()=>[{group_id:789,group_name:'新群'}]});
 const self={sendReply:async(id,text)=>sent.push(text)},msg={message_type:1,from_user_id:'wx-owner',item_list:[{type:1,text_item:{text:'给新群加入主动群'}}]};
 await wrap.processMessage.call(self,msg);assert.match(sent[0],/已开启/);
 await wrap.processMessage.call(self,{...msg,item_list:[{...msg.item_list[0],ref_msg:{}}]});assert.equal(fallback,1);assert.equal(sent.length,1);
});
