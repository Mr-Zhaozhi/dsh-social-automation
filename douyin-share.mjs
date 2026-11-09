import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {harness,lock} from './lib/runtime.mjs';
const args=process.argv.slice(2),opt=k=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:'';
const name=opt('name'),url=opt('url');
if(!name||!url||!args.includes('--confirm'))throw new Error('用法：--name 精确昵称 --url 作品链接 --confirm');
const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
const {VideoForwarder}=await import(pathToFileURL(path.join(pkg,'video-forward.mjs')));
const contacts=JSON.parse(fs.readFileSync(path.join(pkg,'state/chat-policy.json'))).allowlist.filter(c=>c.name===name&&!c.isGroup);
if(contacts.length!==1)throw new Error('没有唯一已核对收件人，请先配置联系人');
const release=lock('browser-actions'),forwarder=new VideoForwarder({source:'dsh',stateDir:path.join(pkg,'state')});
try{const result=await forwarder.forward({recipientId:contacts[0].id,url},{humanAuthorized:true,signal:AbortSignal.timeout(60000)});console.log(JSON.stringify(result));if(!result.confirmed)process.exitCode=1;}
finally{await forwarder.close();release();}
