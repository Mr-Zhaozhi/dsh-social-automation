import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
import {assertInboxAllowed} from './inbox-policy.mjs?v=3';
import {workspace,harness,atomicJSON,day} from './runtime.mjs';import {assertBrowseSelection,browseSelection} from './browse-policy.mjs';
const defaultRoot=path.join(workspace,'.state/watch-time');
export function watchEntries(root,platform){
 const file=path.join(root,platform+'.json'),v=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{version:1,entries:[]};
 if(v.version!==1||!Array.isArray(v.entries)||v.entries.some(x=>!Number.isFinite(x.ms)||x.ms<0))throw new Error('观看计时记录异常');return v;
}
export function otherWatchMs(root=defaultRoot,date=day()){return ['xiaohongshu','zhihu','douyin-incoming'].reduce((sum,p)=>sum+watchEntries(root,p).entries.filter(x=>x.date===date).reduce((n,x)=>n+x.ms,0),0);}
export function nativeWatchMs(date=day()){
 const location=process.env.DOUYIN_RUNTIME_LOCATION_FILE||path.join(os.homedir(),'.dsh/douyin-browser/runtime-location.json');
 const stored=fs.existsSync(location)?JSON.parse(fs.readFileSync(location)):{};
 const directory=process.env.DOUYIN_STATE_DIR||stored.stateDir||path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/state');
 const f=path.join(directory,'video-usage.json');if(!fs.existsSync(f))throw new Error('抖音观看账本不可用，未重新计时');
 const v=JSON.parse(fs.readFileSync(f));if(v.version!==1||!v.days||Object.values(v.days).some(n=>!Number.isFinite(n)||n<0))throw new Error('抖音观看账本异常');
 // Preserve the small outstanding native playback lease conservatively.
 const active=v.active,extra=active&&new Date(active.fromAt+8*3600000).toISOString().slice(0,10)===date?Math.max(0,active.expiresAt-active.fromAt):0;
 return (v.days[date]||0)*1000+extra;
}
export function nativeBrowseAllowance(usedSeconds,{root=defaultRoot,date=day(),selection=browseSelection('douyin')}={}){
 const remainingSeconds=Math.max(0,1800-usedSeconds-otherWatchMs(root,date)/1000);
 return {allowed:selection.allowed&&remainingSeconds>0,remainingSeconds,reason:selection.allowed?'所有平台共享的今日30分钟浏览额度已用完':selection.reason};
}
export function beginWatch({root=defaultRoot,now=Date.now,today=day,maxSeconds=90,platform='xiaohongshu',nativeUsedMs,purpose='autonomous',evidence}={}){
 if(!['xiaohongshu','zhihu','douyin-incoming'].includes(platform))throw new Error('无效浏览平台');
 if(!Number.isFinite(maxSeconds)||maxSeconds<=0)throw new Error('观看时长无效');
 if(purpose==='incoming'){
  const actual=platform==='douyin-incoming'?'douyin':platform;
  if(!evidence?.eventId||!evidence.peer||evidence.platform!==actual||!['private-share','comment-mention','comment-reply'].includes(evidence.kind)||!evidence.id)throw new Error('被动查看缺少入站证据');
  if(root===defaultRoot)assertInboxAllowed(actual);
  maxSeconds=Math.min(maxSeconds,180);
 }else{if(purpose!=='autonomous'||platform==='douyin-incoming')throw new Error('无效观看来源');if(root===defaultRoot)assertBrowseSelection(platform);}
 const file=path.join(root,platform+'.json'),guard=path.join(root,'shared.lock');fs.mkdirSync(root,{recursive:true});
 const edit=fn=>{let fd;try{fd=fs.openSync(guard,'wx',0o600);}catch{throw new Error('共享观看计时正在写入或需要核对');}try{const v=watchEntries(root,platform);const r=fn(v);atomicJSON(file,v);return r;}finally{fs.closeSync(fd);fs.unlinkSync(guard);}};
 const start=now(),date=today(),id=randomUUID();
 const allowedMs=edit(v=>{const native=nativeUsedMs??(root===defaultRoot?nativeWatchMs(date):0);if(!Number.isFinite(native)||native<0)throw new Error('抖音观看计时异常');const used=otherWatchMs(root,date)+native;const midnight=Date.parse(date+'T00:00:00+08:00')+86400000;const ms=Math.floor(Math.min(1800000-used,maxSeconds*1000,midnight-start));if(ms<=0)throw new Error('所有平台今日共享累计30分钟已用完');v.entries.push({id,date,ms,status:'reserved',at:start,purpose,...(evidence?{eventId:evidence.eventId}: {})});return ms;});
 let done=false;
 return {allowedMs,finish(){if(done)return;edit(v=>{const entry=v.entries.find(x=>x.id===id);if(!entry)throw new Error('观看计时预约缺失');entry.ms=Math.min(allowedMs,Math.max(0,now()-start));entry.status='settled';});done=true;}};
}
