import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {workspace} from './runtime.mjs';
import {assertRunner} from './fleet.mjs';
export async function onebot(action,payload={}){
 if(/^(send_|set_|delete_|upload_)/.test(action))await assertRunner();
 const cfg=JSON.parse(fs.readFileSync(path.join(workspace,'automation.json'))),token=fs.readFileSync(path.join(os.homedir(),'.dsh/secrets/onebot.token'),'utf8').trim();
 const r=await fetch(cfg.onebot_url.replace(/\/$/,'')+'/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 const value=await r.json();if(!r.ok||value.status!=='ok'||value.retcode)throw new Error('OneBot操作失败：'+action);return value.data;
}
