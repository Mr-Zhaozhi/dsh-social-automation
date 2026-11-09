import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {harness} from '../lib/runtime.mjs';
const native=path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/chat-agent.mjs');
test('installed Douyin reply path actually receives cross-platform owner memory', {skip:!fs.existsSync(native)||!fs.readFileSync(native,'utf8').includes('HUOHUO_SHARED_CONTEXT')},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-native-memory-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'.state/shared-context'),{recursive:true});fs.writeFileSync(path.join(root,'automation.json'),'{}');fs.writeFileSync(path.join(root,'.state/shared-context/bindings.json'),JSON.stringify({owners:{qq:['owner'],douyin:['peer']}}));
 const module=new URL('../lib/shared-context.mjs',import.meta.url).href;
 const script=`import assert from 'node:assert/strict';import {sharedContext} from ${JSON.stringify(module)};import {ChatAgent} from ${JSON.stringify(pathToFileURL(native).href)};
 sharedContext.record(sharedContext.route('qq','owner'),{id:'remember',text:'跨平台验收暗号是紫色风筝'});
 let expected=true;const agent=new ChatAgent({config:{model:'test'},replyProvider:async({messages})=>{assert.equal(JSON.stringify(messages).includes('紫色风筝'),expected);return {text:'收到啦'};}});
 await agent.reply({messages:[{id:'new',sender:'incoming',text:'我刚才在QQ说什么'}],conversation:{id:'peer',displayName:'测试用户',isGroup:false}});
 expected=false;await agent.reply({messages:[{id:'other',sender:'incoming',text:'我刚才在QQ说什么'}],conversation:{id:'stranger',displayName:'测试访客',isGroup:false}});
 console.log('native provider received owner context; stranger excluded; no network send');`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,HUOHUO_WORKSPACE:root}});assert.equal(r.status,0,r.stderr);
});
