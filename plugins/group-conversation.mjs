import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {workspace,harness,atomicJSON,day} from '../lib/runtime.mjs';
import {createHash} from 'node:crypto';
import {attentionClassifier} from '../lib/group-attention-model.mjs';
export const name='huohuo-group-conversation';export const inject=['llm','agentDefaultModel'];
export async function apply(ctx){
 const source=path.join(workspace,'lib/group-attention.mjs');const revision=createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0,12);
 const {attentionRouting}=await import(pathToFileURL(source).href+'?revision='+revision);
 const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-onebot-qq'));
 if(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version!=='0.9.17')throw Error('QQ插件升级，需核对群接话接口');
 const {InboundPipeline}=await import(pathToFileURL(path.join(pkg,'lib/inbound.js')).href),decide=attentionClassifier(ctx);
 const budgetFile=path.join(workspace,'.state/group-attention-budget.json');
 const allowClassification=(group,now)=>{
  let state;try{state=JSON.parse(fs.readFileSync(budgetFile));}catch(e){if(e.code!=='ENOENT')return false;state={};}
  if(state.day!==day())state={day:day(),groups:{}};
  const row=state.groups[group]||{count:0,times:[]};row.times=row.times.filter(t=>now-t<60000);
  if(row.count>=120||row.times.length>=6||now-(row.times.at(-1)||0)<4000)return false;
  row.count++;row.times.push(now);state.groups[group]=row;atomicJSON(budgetFile,state);return true;
 };
 ctx.effect(()=>{
  const original=InboundPipeline.prototype.processInbound;
  const wrapped=attentionRouting(original,{readPolicy:id=>{try{return JSON.parse(fs.readFileSync(path.join(workspace,'automation.json'))).qq_groups?.[id];}catch{return undefined;}},decide,allowClassification,onEvent:event=>fs.appendFileSync(path.join(workspace,'.state/group-attention.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600})});
  InboundPipeline.prototype.processInbound=wrapped;
  atomicJSON(path.join(workspace,'.state/group-attention-runtime.json'),{active:true,pid:process.pid,at:new Date().toISOString(),classifierPerGroupPerDay:120,classifierPerMinute:6,revision});
  return()=>{if(InboundPipeline.prototype.processInbound===wrapped)InboundPipeline.prototype.processInbound=original;};
 });
 const probe=path.join(workspace,'.state/group-attention-probe.json');
 if(fs.existsSync(probe)){
  const cases=JSON.parse(fs.readFileSync(probe));fs.renameSync(probe,probe+'.claimed');
  void(async()=>{const results=[];for(const c of cases){try{results.push({name:c.name,result:await decide(c.input)});}catch{results.push({name:c.name,error:'classifier-failed'});}}atomicJSON(path.join(workspace,'.state/group-attention-probe-result.json'),{at:new Date().toISOString(),results});})();
 }
}
