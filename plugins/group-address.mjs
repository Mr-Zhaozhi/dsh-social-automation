import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {directAddressHandler} from '../lib/group-address.mjs';
export const name='huohuo-group-address';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const harness=process.env.DSH_HOME||path.join(os.homedir(),'Library/Application Support/dsh-desktop/harness');
const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-onebot-qq'));
const {InboundPipeline}=await import(pathToFileURL(path.join(pkg,'lib/inbound.js')).href);
export function apply(ctx){
  if(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).version!=='0.9.17')throw new Error('QQ 插件升级，需核对直接称呼适配');
  ctx.effect(()=>{
    const original=InboundPipeline.prototype.processInbound;
    const wrapped=directAddressHandler(original,id=>JSON.parse(fs.readFileSync(path.join(root,'automation.json'),'utf8')).qq_groups?.[id],inbound=>{
      fs.appendFileSync(path.join(root,'.state/group-listener.jsonl'),JSON.stringify({at:new Date().toISOString(),group:inbound.groupId,messageId:inbound.messageId,reason:'direct-address-routing',nativePolicyChecks:true})+'\n',{mode:0o600});
    });
    InboundPipeline.prototype.processInbound=wrapped;
    fs.writeFileSync(path.join(root,'.state/group-address-runtime.json'),JSON.stringify({active:true,pid:process.pid,at:new Date().toISOString()}),{mode:0o600});
    return ()=>{if(InboundPipeline.prototype.processInbound===wrapped)InboundPipeline.prototype.processInbound=original;};
  });
}
