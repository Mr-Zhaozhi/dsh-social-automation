import fs from 'node:fs';import path from 'node:path';
import {workspace,harness} from './runtime.mjs';
import {socialBudget} from './social-budget.mjs';
const read=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):fallback;
export function seedLegacyBudgets(){
 const native=path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/state');
 const posts=read(path.join(workspace,'.state/douyin-actions.json'),{actions:[]}).actions.filter(a=>a.kind==='post'&&a.status!=='failed');
 const comments=read(path.join(native,'comment-browser-receipts.json'),{operations:[]}).operations.map(a=>({date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.startedAt))}));
 const messages=read(path.join(native,'outbound-receipts.json'),{receipts:[]}).receipts;
 socialBudget.seed('douyin','post',posts);socialBudget.seed('douyin','comment',comments);socialBudget.seed('douyin','private',messages);
}
