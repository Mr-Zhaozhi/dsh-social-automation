import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {pathToFileURL} from 'node:url';import {harness,workspace,atomicJSON} from './lib/runtime.mjs';
// Snapshot reads only. DSH v4 files contain one Zstandard frame per appended entry.
export function decodeSession(file){const b=fs.readFileSync(file);let at=0,text='';while(at<b.length){try{const r=zlib.zstdDecompressSync(b.subarray(at),{info:true});if(!r.engine.bytesWritten)break;at+=r.engine.bytesWritten;text+=r.buffer.toString();}catch{break;}}return text.split('\n').filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)]}catch{return []}});}
const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
export function costUsage(u,model,at){
 const miss=u.inputTokens||0,hit=u.cacheReadTokens||0,write=u.cacheWriteTokens||0,out=u.outputTokens||0;
 const d=new Date(at+8*3600000),hour=d.getUTCHours(),weekday=d.getUTCDay(),peak=weekday>=1&&weekday<=5&&(hour>=9&&hour<12||hour>=14&&hour<18);
 // Nov 6/7 2026 are ordinary Friday/Saturday. General-date values omit holiday overrides and are estimates.
 const rate=/^deepseek-(?:v4(?:\.1)?-)?flash(?:-|$)/.test(model)?[1,.02,4]:/^deepseek-(?:v4-)?pro(?:-|$)/.test(model)?[4.5,.15,13.5]:null;
 return {miss,hit,write,out,input:miss+hit+write,estimateCNY:rate?(miss*rate[0]+hit*rate[1]+write*rate[0]+out*rate[2])/1e6*(peak?2:1):null};
}
export function category(cwd,id){return /aik_auto_memory_use/.test(cwd)?'memory-workbench':/huohuo-qq/.test(cwd)?id.startsWith('onebot-private')?'qq-private':id.startsWith('onebot-group')?'qq-group':id.startsWith('wechat')?'wechat':'workspace-other':'other-workspace';}
export function audit(root=path.join(harness,'sessions')){
 const requests=[],seen=new Set(),files=[];for(const wd of fs.readdirSync(root)){const p=path.join(root,wd);if(!fs.statSync(p).isDirectory())continue;for(const id of fs.readdirSync(p)){const f=path.join(p,id,'session.v4.jsonl.zstd');if(fs.existsSync(f))files.push(f);}}
 for(const f of files){let header={},turn=0,trigger='unknown',systemChars=0,toolsChars=0;const rows=decodeSession(f),meta=rows.find(r=>r.type==='session')||{};for(const r of rows){
  if(r.type==='turn/start'){turn=r.data?.turn;trigger='unknown';}
  if(r.type==='user/message'&&trigger==='unknown'){const d=r.data||{};const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join(' ');trigger=/自动化:|定时任务|schedule|唤醒|定时触发/.test(txt)?'scheduled':d.source?.kind||'unknown';}
  if(r.type==='request/header'){header=r.data?.header?.config||{};toolsChars=JSON.stringify(r.data?.header?.tools||[]).length;}
  if(r.type==='system/message')systemChars=JSON.stringify(r.data||{}).length;
  if(r.type!=='assistant/message'||!r.data?.usage)continue;const d=r.data,m=d.message||{},key=m.id||meta.id+':'+r.seq;if(seen.has(key))continue;seen.add(key);
  const model=m.source?.model||header.model||'unknown',at=Number(r.time),usage=costUsage(d.usage,model,at);requests.push({id:key,session:meta.id||path.basename(path.dirname(f)),category:category(meta.cwd||'',meta.id||''),date:day(at),at:new Date(at).toISOString(),model,provider:m.source?.provider||header.provider,reasoning:header.reasoningEffort,turn:d.turn||turn,trigger,step:d.step,systemChars,toolsChars,...usage});
 }}
 const groups={};for(const r of requests){const key=[r.date,r.category,r.model].join('|');const g=groups[key]||={date:r.date,category:r.category,model:r.model,requests:0,input:0,miss:0,hit:0,out:0,estimateCNY:0};g.requests++;for(const k of ['input','miss','hit','out','estimateCNY'])g[k]+=r[k]||0;}
 return {generatedAt:new Date().toISOString(),scope:'DSH session assistant usage, deduplicated by message ID; plugin direct streams may be missing; official RMB rates are estimates, not provider billing',files:files.length,groups:Object.values(groups).sort((a,b)=>b.date.localeCompare(a.date)||b.estimateCNY-a.estimateCNY),requests};
}
// These are separate direct-stream ledgers, not normal assistant session records.
export function pluginUsage(root=path.join(workspace,'.state/model-usage')){
 const groups={},seen=new Set();
 for(const f of fs.existsSync(root)?fs.readdirSync(root).filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)):[]){
  for(const line of fs.readFileSync(path.join(root,f),'utf8').split('\n')){let r;try{r=JSON.parse(line);}catch{continue;}if(seen.has(r.id))continue;seen.add(r.id);
   const key=[f.slice(0,10),r.purpose,r.model].join('|'),g=groups[key]||={date:f.slice(0,10),purpose:r.purpose,model:r.model,requests:0,unknownUsage:0,failed:0,estimateCNY:0};g.requests++;if(r.status!=='completed')g.failed++;
   if(!r.usage||r.usage.inputTokens===undefined||r.usage.outputTokens===undefined||r.usage.cacheReadTokens===undefined){g.unknownUsage++;continue;}
   const cost=costUsage(r.usage,r.model,Date.parse(r.at)).estimateCNY;if(cost===null)g.unknownUsage++;else g.estimateCNY+=cost;
  }
 }
 return Object.values(groups);
}
export function nativeUsage(root){
 const groups={},seen=new Set();
 for(const f of fs.existsSync(root)?fs.readdirSync(root).filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)):[]){
  for(const line of fs.readFileSync(path.join(root,f),'utf8').split('\n')){let r;try{r=JSON.parse(line);}catch{continue;}if(seen.has(r.id))continue;seen.add(r.id);
   const key=[f.slice(0,10),r.kind,r.model].join('|'),g=groups[key]||={date:f.slice(0,10),purpose:'douyin-'+r.kind,model:r.model,requests:0,unknownUsage:0,estimateCNY:0};g.requests++;
   const u=r.usage;if(!u||![u.promptTokens,u.cachedTokens,u.completionTokens].every(Number.isSafeInteger)||!['api','dsh'].includes(r.source)){g.unknownUsage++;continue;}
   // Installed DSH adapter maps inputTokens (cache misses) to promptTokens;
   // HTTP API prompt_tokens includes cache hits. Do not subtract hits twice.
   const cost=costUsage({inputTokens:r.source==='dsh'?u.promptTokens:Math.max(0,u.promptTokens-u.cachedTokens),cacheReadTokens:u.cachedTokens,outputTokens:u.completionTokens},r.model,Date.parse(r.at)).estimateCNY;
   if(cost===null)g.unknownUsage++;else g.estimateCNY+=cost;
  }
 }
 return Object.values(groups);
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const since=process.argv[2]||day(Date.now()-86400000);if(!/^\d{4}-\d{2}-\d{2}$/.test(since))throw Error('用法：./node-run.sh cost-audit.mjs [YYYY-MM-DD]');
 const report=audit();report.pluginGroups=pluginUsage();
 try{const {resolveRuntimePaths}=await import(pathToFileURL(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/runtime-paths.mjs')));report.douyinGroups=nativeUsage(path.join(resolveRuntimePaths().stateDir,'usage'));}catch{report.douyinGroups=[];report.douyinUnavailable=true;}
 atomicJSON(path.join(workspace,'.state/cost-audit.json'),report);
 console.log(JSON.stringify({since,files:report.files,scope:report.scope,groups:report.groups.filter(g=>g.date>=since),pluginGroups:report.pluginGroups.filter(g=>g.date>=since),douyinGroups:report.douyinGroups.filter(g=>g.date>=since),douyinUnavailable:report.douyinUnavailable},null,2));
}
