import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {workspace} from './runtime.mjs';

// Counters only: never persist prompts, replies, contacts or credentials here.
export function recordModelUsage(row,root=workspace){
 const at=new Date().toISOString(),date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const dir=path.join(root,'.state/model-usage');fs.mkdirSync(dir,{recursive:true});
 fs.appendFileSync(path.join(dir,date+'.jsonl'),JSON.stringify({id:randomUUID(),at,...row})+'\n',{mode:0o600});
}
export async function* meteredStream(ctx,request,{record=recordModelUsage}={}){
 let usage=null,status='incomplete';const started=Date.now();
 try{
  for await(const chunk of ctx.llm.stream(request)){
   if(chunk.type==='usage'){
    usage||={};for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens'])if(Number.isSafeInteger(chunk.usage?.[key])&&chunk.usage[key]>=0)usage[key]=chunk.usage[key];
   }
   if(chunk.type==='finish')status=chunk.reason?.kind==='stop'?'completed':'incomplete';
   yield chunk;
  }
 }catch(error){status='failed';throw error;}
 finally{
  try{record({purpose:request.sessionId||'unclassified',provider:request.provider,model:request.model,reasoningEffort:request.reasoningEffort||'default',status,durationMs:Date.now()-started,usage});}
  catch{ctx.logger?.warn('模型用量记录写入失败');}
 }
}
