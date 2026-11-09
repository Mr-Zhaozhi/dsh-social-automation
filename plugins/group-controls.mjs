import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {workspace,harness,atomicJSON} from '../lib/runtime.mjs';
import {groupRouting,groupWeChatRouting} from '../lib/group-routing.mjs';
import {onebot} from '../lib/onebot.mjs';
export const name='huohuo-group-controls';
export async function apply(ctx){
 const pkg=name=>fs.realpathSync(path.join(harness,'profiles/web/node_modules',name));const qq=pkg('dsh-onebot-qq'),wx=pkg('dsh-wechat');
 if(JSON.parse(fs.readFileSync(path.join(qq,'package.json'))).version!=='0.9.17'||JSON.parse(fs.readFileSync(path.join(wx,'package.json'))).version!=='0.16.1')throw Error('原插件升级，需要复核群控制接口');
 const {InboundPipeline}=await import(pathToFileURL(path.join(qq,'lib/inbound.js')).href),{WeChatDSHBridge}=await import(pathToFileURL(path.join(wx,'dist/bridge/bridge.js')).href);
 ctx.effect(()=>{
  const q=InboundPipeline.prototype,w=WeChatDSHBridge.prototype,old={qq:q.processInbound,wx:w.processMessage,command:w.tryNativeCommand};
  const options={root:workspace,call:onebot,onEvent:event=>atomicJSON(path.join(workspace,'.state/group-controls-last.json'),{at:new Date().toISOString(),...event})};
  const qqHandler=groupRouting(old.qq,options),wxHandler=groupWeChatRouting(old.wx,old.command,options);
  q.processInbound=qqHandler;w.processMessage=wxHandler.processMessage;w.tryNativeCommand=wxHandler.tryNativeCommand;
  atomicJSON(path.join(workspace,'.state/group-controls-runtime.json'),{active:true,pid:process.pid,at:new Date().toISOString()});
  return()=>{if(q.processInbound===qqHandler)q.processInbound=old.qq;if(w.processMessage===wxHandler.processMessage)w.processMessage=old.wx;if(w.tryNativeCommand===wxHandler.tryNativeCommand)w.tryNativeCommand=old.command;};
 });
}
