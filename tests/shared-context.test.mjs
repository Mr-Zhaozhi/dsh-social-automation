import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SharedContext} from '../lib/shared-context.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-context-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'.state/shared-context'),{recursive:true});fs.writeFileSync(path.join(root,'.state/shared-context/bindings.json'),JSON.stringify({owners:{qq:['123'],wechat:['owner-wx'],douyin:['conv:owner']}}));return new SharedContext({root,home:root});}
test('owner can continue QQ conversation on WeChat and Douyin; unrelated people cannot',t=>{
 const s=fixture(t),qq=s.route('qq','123');s.record(qq,{id:'1',text:'周末想去公园看松鼠'});
 for(const platform of ['wechat','douyin'])assert.match(s.render(s.route(platform,platform==='wechat'?'owner-wx':'conv:owner')),/公园看松鼠/);
 assert.doesNotMatch(s.render(s.route('xiaohongshu','stranger')),/公园看松鼠/);
 assert.doesNotMatch(s.render(s.route('qq','123',{publicChat:true})),/公园看松鼠/);
 assert.equal(s.route('wechat','朋友').owner,false);
});
test('real native events capture plain text only and do not recirculate snapshots',t=>{
 const s=fixture(t),session={id:'onebot-private-123',header:{cwd:s.root}};
 s.observe(session,{type:'user/message',time:Date.now(),data:{id:'u',source:{kind:'plugin:dsh-onebot'},content:[{type:'text',text:'昨天的散步呢'}]}});
 const e={type:'assistant/message',time:Date.now(),data:{message:{id:'a',content:[{type:'reasoning',text:'PRIVATE THINKING'},{type:'text',text:'记得那次散步'}]}}};s.observe(session,e);s.observe(session,e);
 s.observe(session,{type:'user/message',time:Date.now(),data:{id:'bad',source:{kind:'plugin',form:'snapshot'},content:[{type:'text',text:'SHOULD NOT REINGEST'}]}});
 assert.equal(s.rows().length,2);assert.match(s.render(s.route('qq','123')),/记得那次散步/);assert.doesNotMatch(s.render(s.route('qq','123')),/PRIVATE THINKING|SHOULD NOT REINGEST/);
 assert.equal(s.rows().find(r=>r.role==='assistant').status,'generated');
});
test('public activity shared; strangers private history stays with its peer; survives reload',t=>{
 const s=fixture(t);s.record(s.route('xiaohongshu','friend-a'),{id:'a',text:'我的私人秘密'});s.record(s.route('zhihu','activity',{publicChat:true}),{id:'read',role:'activity',text:'读过AI工具的文章',status:'read'});
 const fresh=new SharedContext({root:s.root,home:s.root});const text=fresh.render(s.route('wechat','owner-wx'));assert.match(text,/AI工具/);assert.doesNotMatch(text,/私人秘密/);assert.match(fresh.render(s.route('xiaohongshu','friend-a')),/私人秘密/);
});
test('bounded context valid JSON, old entries expire, credentials are redacted',t=>{
 const s=fixture(t),r=s.route('qq','123');for(let i=0;i<20;i++)s.record(r,{id:String(i),text:'内容'.repeat(1000)});
 s.record(r,{id:'secret',text:'api_key=secret-value Bearer secret-token'});s.record(r,{id:'old',text:'很久以前',at:Date.now()-15*86400000});
 const text=s.render(r),json=text.slice(text.indexOf('\n')+1);assert.doesNotThrow(()=>JSON.parse(json));assert.ok(json.length<=4200);assert.doesNotMatch(text,/secret-value|secret-token|很久以前/);
});
test('only matching workspace and exact WeChat binding share owner context',t=>{
 const s=fixture(t);fs.mkdirSync(path.join(s.home,'.dsh-wechat'));fs.writeFileSync(path.join(s.home,'.dsh-wechat/state.json'),JSON.stringify({users:{owner:{userId:'owner-wx',sessionId:'session-wechat'}}}));
 assert.equal(s.sessionRoute({id:'session-wechat',header:{cwd:s.root}}).owner,true);assert.equal(s.sessionRoute({id:'session-other',header:{cwd:s.root}}),null);assert.equal(s.sessionRoute({id:'onebot-private-123',header:{cwd:'/other'}}),null);
});
test('group context is available to owner but never copied to strangers or other groups',t=>{
 const s=fixture(t);s.record(s.route('qq','group-a',{publicChat:true}),{id:'group',text:'群A讨论的小游戏'});
 assert.match(s.render(s.route('wechat','owner-wx')),/群A讨论/);
 assert.match(s.render(s.route('qq','group-a',{publicChat:true})),/群A讨论/);
 assert.doesNotMatch(s.render(s.route('qq','group-b',{publicChat:true})),/群A讨论/);
 assert.doesNotMatch(s.render(s.route('douyin','stranger')),/群A讨论/);
});
