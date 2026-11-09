import fs from 'node:fs';
import path from 'node:path';
import {formatFetchOutput} from '@deepseek-ai/dsh-tool-web';
import {workspace,atomicJSON} from '../lib/runtime.mjs';
import {probeWeb} from '../lib/web-probe.mjs';
export const name='huohuo-web-diagnostics';
export const inject=['web'];
export function apply(ctx){
 const request=path.join(workspace,'.state/web-probe-request.json');
 // Consume before calling a provider: a reload must not repeat paid searches.
 if(!fs.existsSync(request))return;
 fs.renameSync(request,request+'.claimed');
 void probeWeb(ctx.web,formatFetchOutput).then(r=>atomicJSON(path.join(workspace,'.state/web-capabilities.json'),r)).catch(()=>atomicJSON(path.join(workspace,'.state/web-capabilities.json'),{checkedAt:new Date().toISOString(),error:'PROBE_FAILED'}));
}
