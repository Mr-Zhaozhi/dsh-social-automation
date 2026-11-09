import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {harness,workspace,atomicJSON} from '../lib/runtime.mjs';
import {inboxAllowed} from '../lib/inbox-policy.mjs';import {assertRunner} from '../lib/fleet.mjs';
import {recoverClosedPanel} from '../lib/chat-panel-recovery.mjs';
export const name='huohuo-chat-panel-recovery';
export async function apply(ctx){
 const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
 const classes=new Set();for(const suffix of ['', '?v=18'])classes.add((await import(pathToFileURL(path.join(pkg,'chat-browser.mjs')).href+suffix)).ChatBrowser);
 const allowed=async()=>{if(!inboxAllowed('douyin'))return false;const policy=JSON.parse(fs.readFileSync(path.join(pkg,'state/friend-interactions-policy.json')));if(policy.enabled!==true)return false;await assertRunner();return true;};
 ctx.effect(()=>{const saved=[];for(const type of classes){const old=type.prototype.readConversation;const wrapped=recoverClosedPanel(old,{allowed,report:r=>atomicJSON(path.join(workspace,'.state/chat-panel-recovery.json'),r)});type.prototype.readConversation=wrapped;saved.push([type,old,wrapped]);}return()=>{for(const [type,old,wrapped]of saved)if(type.prototype.readConversation===wrapped)type.prototype.readConversation=old;};});
}
