import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import vm from 'node:vm';
import {harness} from '../lib/runtime.mjs';

test('installed OneBot member permissions and guidance agree',{skip:process.env.HUOHUO_NATIVE_TESTS!=='1'},async()=>{
 const base=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-onebot-qq'));
 const {buildPlatformPrompt}=await import(pathToFileURL(path.join(base,'lib/prompt.js')));
 // These pure native gate methods need no DSH loader or model service.
 const code=fs.readFileSync(path.join(base,'lib/bridge.js'),'utf8');
 const methods=['canEditFiles','memberToolsAllowed'].map(name=>{const match=code.match(new RegExp('    '+name+'\\(sessionId\\) \\{[\\s\\S]*?\\n    \\}'));assert(match,name);return match[0];});
 const ChatBridge={prototype:vm.runInNewContext('({'+methods.join(',')+'})')};
 const bridge=memberTools=>({deps:{config:{permissions:{memberTools}}},bySession:new Map([['member-session','group:10000003'],['admin-session','group:10000004']]),chats:new Map([['group:10000003',{activeTurnRole:'member'}],['group:10000004',{activeTurnRole:'admin'}]]),canEditFiles:ChatBridge.prototype.canEditFiles});
 assert.equal(ChatBridge.prototype.memberToolsAllowed.call(bridge('none'),'member-session'),false);
 assert.equal(ChatBridge.prototype.memberToolsAllowed.call(bridge('all'),'member-session'),true);
 assert.equal(ChatBridge.prototype.memberToolsAllowed.call(bridge('none'),'admin-session'),true);
 assert.equal(ChatBridge.prototype.canEditFiles.call(bridge('all'),'member-session'),false);
 assert.match(buildPlatformPrompt(false,'all'),/可以请求语音/);
 assert.doesNotMatch(buildPlatformPrompt(false,'all'),/仅与其聊天问答/);
 assert.match(buildPlatformPrompt(true,'none'),/仅与其聊天问答/);
 assert.match(buildPlatformPrompt(false),/仅与其聊天问答/);
});
