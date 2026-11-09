import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {workspace,harness,atomicJSON} from '../lib/runtime.mjs';
export const name='huohuo-quick-status';
const pkg=name=>fs.realpathSync(path.join(harness,'profiles/web/node_modules',name));
export async function apply(ctx){
 const routing=path.join(workspace,'lib/quick-query-routing.mjs');
 const revision=createHash('sha256').update(fs.readFileSync(routing)).digest('hex').slice(0,12);
 // Reload this small adapter independently of the host's cached native classes.
 const {quickQQHandler,quickWeChatHandlers}=await import(pathToFileURL(routing).href+'?revision='+revision);
 const qq=pkg('dsh-onebot-qq'),wx=pkg('dsh-wechat');
 if(JSON.parse(fs.readFileSync(path.join(qq,'package.json'))).version!=='0.9.17'||JSON.parse(fs.readFileSync(path.join(wx,'package.json'))).version!=='0.16.1')throw Error('插件升级，需要复核快捷查询接口');
 const {InboundPipeline}=await import(pathToFileURL(path.join(qq,'lib/inbound.js')).href);
 const {WeChatDSHBridge}=await import(pathToFileURL(path.join(wx,'dist/bridge/bridge.js')).href);
 ctx.effect(()=>{
  const q=InboundPipeline.prototype,w=WeChatDSHBridge.prototype;
  const originals={qq:q.processInbound,wx:w.processMessage,command:w.tryNativeCommand};
  const options={root:workspace,onReply:(platform,kind)=>atomicJSON(path.join(workspace,'.state/quick-query-last.json'),{at:new Date().toISOString(),platform,kind,modelCalled:false})};
  const qqWrapped=quickQQHandler(originals.qq,options),wxWrapped=quickWeChatHandlers(originals.wx,originals.command,options);
  q.processInbound=qqWrapped;w.processMessage=wxWrapped.processMessage;w.tryNativeCommand=wxWrapped.tryNativeCommand;
  atomicJSON(path.join(workspace,'.state/quick-query-runtime.json'),{active:true,pid:process.pid,at:new Date().toISOString(),revision});
  return()=>{if(q.processInbound===qqWrapped)q.processInbound=originals.qq;if(w.processMessage===wxWrapped.processMessage)w.processMessage=originals.wx;if(w.tryNativeCommand===wxWrapped.tryNativeCommand)w.tryNativeCommand=originals.command;};
 });
}
