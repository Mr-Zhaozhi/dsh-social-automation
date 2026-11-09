import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {harness,workspace,lock,atomicJSON,day} from './lib/runtime.mjs';
const args=process.argv.slice(2),opt=k=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:'';
const name=opt('name'),text=opt('text');
if(!name||!text||!args.includes('--confirm'))throw new Error('用法：--name 精确昵称 --text 正文 --confirm');
const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
const {ChatBrowser}=await import(pathToFileURL(path.join(pkg,'chat-browser.mjs')));
const {OutboundCoordinator}=await import(pathToFileURL(path.join(pkg,'outbound-send.mjs')));
const {matchesAuthorizedContact}=await import(pathToFileURL(path.join(pkg,'contact-authorization.mjs')));
const release=lock('browser-actions'),chat=new ChatBrowser({source:'dsh-chat'}),signal=AbortSignal.timeout(60000);
try{
 // A reply to an already authorized contact must not enumerate the following list.
 const policy=JSON.parse(fs.readFileSync(path.join(pkg,'state/chat-policy.json')));
 const matches=policy.allowlist.filter(c=>c.name===name&&c.identityVerified&&!c.isGroup);
 if(matches.length!==1)throw new Error('没有唯一且身份已核对的私聊对象，未发送');const contact=matches[0];
 const file=path.join(workspace,'.state/douyin-messages.json'),rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
 if(rows.some(r=>r.id===contact.id&&r.text===text))throw new Error('相同对象和内容已有发送记录，不重复发送');
 const snapshot=await chat.readConversation(contact.id,{allowed:true,signal,weak:['manual','existing-conversation'].includes(contact.authorizationKind),backgroundOnly:true});
 if(snapshot.blocked)throw new Error('登录或会话需要处理');
 if(snapshot.conversation?.id!==contact.id||!matchesAuthorizedContact(contact,snapshot.contact))throw new Error('当前会话与已授权身份不一致，未发送');
 const coordinator=new OutboundCoordinator({stateDir:path.join(pkg,'state'),source:'dsh'});
 const row={id:contact.id,name,text,day:day(),status:'pending'};rows.push(row);atomicJSON(file,rows);
 const authorized=JSON.parse(fs.readFileSync(path.join(pkg,'state/chat-policy.json'))).allowlist.find(c=>c.id===contact.id);
 if(!authorized)throw new Error('请先通过 chat/configure 核对并配置这位联系人');
 const result=await coordinator.run({recipientId:contact.id,purpose:'reply',signal},()=>chat.sendMessage(contact.id,text,{allowed:true,expectedContact:authorized,expectedMessageIds:snapshot.messages.map(m=>m.id),signal}));
 row.status=result.confirmed?'confirmed':result.deliveryUncertain?'unknown':'not-sent';row.receipt=result;atomicJSON(file,rows);
 console.log(JSON.stringify(result));if(!result.confirmed)process.exitCode=1;
}finally{await chat.close();release();}
