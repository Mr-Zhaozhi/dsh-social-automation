import {passiveAccess} from './passive-inbox.mjs?v=2';
import {platformHold} from './platform-holds.mjs';
import fs from 'node:fs';import path from 'node:path';
import {workspace,atomicJSON} from './runtime.mjs';
const platforms=['douyin','xiaohongshu','zhihu'];
export const inboxDefaults={version:1,timeZone:'Asia/Shanghai',enabled:true,startMinute:600,endMinute:1440,pausedUntil:null,platforms:{}};
const labels={douyin:'抖音',xiaohongshu:'小红书',zhihu:'知乎',all:'所有平台'};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function validateInboxPolicy(p){
 if(p?.version!==1||p.timeZone!=='Asia/Shanghai'||typeof p.enabled!=='boolean')throw new Error('主动检查设置格式无效');
 for(const row of [p,...Object.values(p.platforms||{})]){
  if(row.enabled!==undefined&&typeof row.enabled!=='boolean')throw new Error('开关无效');
  const start=row.startMinute??p.startMinute,end=row.endMinute??p.endMinute;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>=1440||end<0||end>1440||start===end)throw new Error('检查时段无效');
  if(row.pausedUntil!=null&&!Number.isFinite(Date.parse(row.pausedUntil)))throw new Error('暂停时间无效');
 }
 if(Object.keys(p.platforms||{}).some(k=>!platforms.includes(k)))throw new Error('未知平台');
 return p;
}
export function inboxStatus(platform,{root=workspace,now=Date.now()}={}){
 if(!platforms.includes(platform))throw new Error('未知检查平台');
 let p;try{const file=path.join(root,'inbox-policy.json');p=fs.existsSync(file)?validateInboxPolicy(JSON.parse(fs.readFileSync(file,'utf8'))):inboxDefaults;}catch{return {allowed:false,reason:'invalid-policy',platform};}
 const local=p.platforms?.[platform]||{},rule={...p,...local},minute=new Date(now+8*3600000).getUTCHours()*60+new Date(now+8*3600000).getUTCMinutes();
 const pause=Math.max(Date.parse(p.pausedUntil)||0,Date.parse(local.pausedUntil)||0);
 const inWindow=rule.startMinute<rule.endMinute?minute>=rule.startMinute&&minute<rule.endMinute:minute>=rule.startMinute||minute<rule.endMinute;
 const hold=platformHold(platform,{root});
 const reason=hold?'platform-warning':!p.enabled||local.enabled===false?'paused':pause>now?'paused-until':!inWindow?'quiet-hours':'active';
 return {allowed:reason==='active',reason,platform,timeZone:p.timeZone,start:clock(rule.startMinute),end:clock(rule.endMinute),pausedUntil:pause>now?new Date(pause).toISOString():null};
}
export const inboxAllowed=(platform,options)=>{const s=inboxStatus(platform,options);return s.allowed||s.reason==='quiet-hours'&&passiveAccess(platform,options);};
export function assertInboxAllowed(platform,options){const s=inboxStatus(platform,options);if(!s.allowed&&!(s.reason==='quiet-hours'&&passiveAccess(platform,options)))throw Object.assign(new Error(`${labels[platform]}新互动检查已暂停（${s.reason}）；按北京时间 ${s.start||'--'}–${s.end||'--'} 检查。`),{code:'INBOX_RESTING',beforeDelivery:true});}
export function assertAutomaticInbox(){const platform=process.env.HUOHUO_AUTOMATIC_INBOX;if(platform)assertInboxAllowed(platform);}
function number(s){if(/^\d+$/.test(s))return Number(s);const d={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};if(s==='十')return 10;if(s.includes('十')){const [a,b]=s.split('十');return (a?d[a]:1)*10+(b?d[b]:0);}return d[s];}
function minute(value){const m=value.match(/^(凌晨|早上|早晨|早|上午|中午|下午|傍晚|晚上|晚|夜里)?\s*([\d零一二两三四五六七八九十]+)(?:(?:点|时)(半|[\d零一二两三四五六七八九十]+分?)?|[:：](\d{2}))?$/);if(!m)return null;let h=number(m[2]),min=m[3]==='半'?30:m[3]?number(m[3].replace(/分$/,'')):Number(m[4]||0);if(['下午','傍晚','晚上','晚','夜里'].includes(m[1])&&h<12)h+=12;if(['晚上','晚','夜里'].includes(m[1])&&h===12)h=24;if(m[1]==='凌晨'&&h===12)h=0;if(!Number.isInteger(h)||!Number.isInteger(min)||h<0||h>24||min<0||min>=60||h===24&&min!==0)return null;return h*60+min;}
export function parseInboxCommand(input){
 let t=String(input||'').trim().replace(/^(?:小伴[，,\s]*)/,'').replace(/[。！!？?]+$/,'').replace(/^(?:请|帮我|给我)\s*/,'');
 if(!/(检查|扫描)/.test(t)||/[“”"'\n]/.test(t))return null;
 const names=t.match(/抖音|小红书|知乎/g)||[];if(new Set(names).size>1)return null;
 const platform=names.length?({抖音:'douyin',小红书:'xiaohongshu',知乎:'zhihu'})[names[0]]:'all';
 t=t.replace(/抖音|小红书|知乎/g,'').replace(/^(?:把|将)/,'').replace(/(?:这些软件|所有平台|全部平台|所有软件)/g,'').replace(/\s+/g,'').replace(/的/g,'');
 const subject='(?:主动)?(?:检查(?:新(?:消息|互动))?|(?:新消息|新互动)检查|扫描(?:新(?:消息|互动))?)';
 if(new RegExp('^(?:查看|看看|查询|现在|目前)?'+subject+'(?:时间|时段|设置|状态|什么时候检查)?$').test(t))return {kind:'status',platform};
 if(new RegExp('^(?:先|暂时)?(?:暂停|停止|关闭|不要|别)'+subject+'(?:了|吧)?$').test(t))return {kind:'pause',platform};
 if(new RegExp('^(?:现在)?(?:恢复|开启|开始|继续)'+subject+'(?:吧)?$').test(t))return {kind:'resume',platform};
 if(new RegExp('^今天(?:不要|别|停止|暂停)'+subject+'(?:了|吧)?$').test(t))return {kind:'today',platform};
 const duration=t.match(new RegExp('^(?:暂停|停止)'+subject+'([\\d零一二两三四五六七八九十]+)(小时|分钟)$'));
 if(duration){const n=number(duration[1])*(duration[2]==='小时'?60:1);return n>0&&n<=7*1440?{kind:'duration',platform,minutes:n}:{kind:'invalid',platform};}
 const until=t.match(new RegExp('^(?:暂停|停止)'+subject+'到(.+)$'))||t.match(new RegExp('^(.+?)(?:再)?(?:恢复|开始|继续)'+subject+'$'));
 if(until){if(!/^(?:凌晨|早上|早晨|早|上午|中午|下午|傍晚|晚上|晚|夜里)?[\d零一二两三四五六七八九十]/.test(until[1]))return null;const end=minute(until[1]);return end!==null?{kind:'until',platform,minute:end}:{kind:'invalid',platform};}
 const range=t.match(new RegExp('^(?:'+subject+'(?:时间|时段)?(?:改成|改为|设为|设置为|调整为|是)?|每天)(?:每天)?(.+?)(?:到|至|[-—~～])(.+?)(?:之间)?(?:可以)?(?:主动)?(?:检查(?:新(?:消息|互动))?)?$'));
 if(range){const start=minute(range[1]),end=minute(range[2]);return start!==null&&start<1440&&end!==null&&start!==end?{kind:'window',platform,startMinute:start,endMinute:end}:{kind:'invalid',platform};}
 return null;
}
export function updateInboxCommand(command,{root=workspace,now=Date.now()}={}){
 const file=path.join(root,'inbox-policy.json');let p=fs.existsSync(file)?validateInboxPolicy(JSON.parse(fs.readFileSync(file,'utf8'))):structuredClone(inboxDefaults);
 const name=labels[command.platform];if(!name)throw new Error('未知平台');
 if(command.kind==='invalid')return '朋友，时间没看明白。可以说“检查时间改成每天10:00到24:00”，或“暂停检查2小时”。';
 if(command.kind!=='status'){
  p.platforms||={};const row=command.platform==='all'?p:(p.platforms[command.platform]||={});
  if(command.kind==='pause'){row.enabled=false;row.pausedUntil=null;}
  else if(command.kind==='resume'){row.enabled=true;row.pausedUntil=null;}
  else if(command.kind==='window'){row.startMinute=command.startMinute;row.endMinute=command.endMinute;}
  else if(['today','duration','until'].includes(command.kind)){
   const midnight=Math.floor((now+8*3600000)/86400000)*86400000-8*3600000;
   let end=command.kind==='duration'?now+command.minutes*60000:command.kind==='today'?midnight+86400000:midnight+command.minute*60000;
   if(end<=now)end+=86400000;row.pausedUntil=new Date(end).toISOString();
  }else throw new Error('未知检查指令');
  p.updatedAt=new Date(now).toISOString();validateInboxPolicy(p);atomicJSON(file,p);
 }
 const targets=command.platform==='all'?platforms:[command.platform];
 const status=targets.map(x=>{const s=inboxStatus(x,{root,now});return `${labels[x]} ${s.start}–${s.end}，${s.allowed?'可检查':s.reason==='quiet-hours'?'夜间休息':s.reason==='paused-until'?'暂停到'+new Date(s.pausedUntil).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'已暂停'}`;}).join('；');
 return `朋友，${command.kind==='status'?'当前设置':'已更新'+name}（北京时间）：${status}。QQ、微信正常收消息回复不受影响。`;
}
export async function handleInboxControl({platform,peer,text,quoted=false,group=false},{root=workspace,now=Date.now(),send}={}){
 if(quoted||group||!['qq','wechat'].includes(platform))return false;
 let owner=false;try{const binds=JSON.parse(fs.readFileSync(path.join(root,'.state/shared-context/bindings.json'),'utf8'));owner=(binds.owners?.[platform]||[]).includes(String(peer));}catch{}
 if(!owner&&platform==='qq')try{owner=String(JSON.parse(fs.readFileSync(path.join(root,'automation.json'),'utf8')).owner_qq)===String(peer);}catch{}
 if(!owner)return false;const command=parseInboxCommand(text);if(!command)return false;
 const reply=updateInboxCommand(command,{root,now});await send(reply);return true;
}
