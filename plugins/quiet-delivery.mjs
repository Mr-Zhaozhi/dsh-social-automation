import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {quietAssistantHandler} from '../lib/quiet-delivery.mjs';
export const name='huohuo-quiet-delivery';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const harness=process.env.DSH_HOME||path.join(os.homedir(),'Library/Application Support/dsh-desktop/harness');
const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-onebot-qq'));
const {InterimTracker}=await import(pathToFileURL(path.join(pkg,'lib/interim.js')).href);
export function apply(ctx){
  if(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).version!=='0.9.17')throw new Error('QQ 插件升级，需重新核对静默回复接口');
  ctx.effect(()=>{
    const original=InterimTracker.prototype.onAssistantMessage;
    const wrapped=quietAssistantHandler(original);
    InterimTracker.prototype.onAssistantMessage=wrapped;
    fs.mkdirSync(path.join(root,'.state'),{recursive:true});
    fs.writeFileSync(path.join(root,'.state/quiet-delivery-runtime.json'),JSON.stringify({active:true,pid:process.pid,at:new Date().toISOString()}),{mode:0o600});
    return ()=>{if(InterimTracker.prototype.onAssistantMessage===wrapped)InterimTracker.prototype.onAssistantMessage=original;};
  });
}
