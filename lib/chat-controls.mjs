import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {workspace,atomicJSON} from './runtime.mjs';
import {handleInboxControl,inboxStatus} from './inbox-policy.mjs';
import {parsePreference,preferences,applyPreference,activityFile,readJSON} from './companion-policy.mjs';
import {onebot} from './onebot.mjs';
export const controlHelp='可以在QQ或微信私聊对我说：\n暂停检查 / 恢复检查 / 暂停检查2小时 / 今天别检查\n检查时间改成每天10:00到24:00 / 抖音暂停检查 / 查看检查时间\n主动一点 / 少主动点 / 主动程度调到80 / 主动聊天时间改成每天10:00到23:00 / 叫我朋友 / 暂停主动聊天 / 恢复主动聊天\n新增主动群 群号 / 关闭主动群 群号 / 查看主动群\n暂停每日说说 / 恢复每日说说 / 暂停每日刷网 / 暂停自动发视频 / 暂停小红书运营\n查看定时任务 / 查看控制请求 / 查看全部设置\n登录扫码、账号绑定、固定音色更换、硬性预算和底层代码仍需维护；不能只凭一句“已改好”当成完成。';
const taskNames={'每日说说':'qzone','空间说说':'qzone','每日刷网':'browse','自动发视频':'douyin-post','抖音发视频':'douyin-post','定时抖音点赞':'douyin-like','小红书运营':'xhs-social'};
export function additionalCommand(input){const t=String(input||'').trim().replace(/^小伴[，,\s]*/,'').replace(/[。！？!?]+$/,'');
 if(/^(设置帮助|控制帮助|你能改哪些设置|可以修改哪些设置|怎么控制你)$/.test(t))return {kind:'help'};
 if(t==='查看全部设置')return {kind:'status'};
 if(t==='查看定时任务')return {kind:'tasks'};
 if(t==='查看控制请求')return {kind:'requests'};
 const m=t.match(/^(暂停|停止|关闭|恢复|开启)\s*(每日说说|空间说说|每日刷网|自动发视频|抖音发视频|定时抖音点赞|小红书运营)$/);
 return m?{kind:'task',key:taskNames[m[2]],name:m[2],action:/恢复|开启/.test(m[1])?'resume':'stop'}:null;
}
export async function handleAdditionalControl(text,{root=workspace,send}={}){
 const c=additionalCommand(text);if(!c)return false;let reply;
 const rulesFile=path.join(root,'automation-schedules.json'),rules=fs.existsSync(rulesFile)?JSON.parse(fs.readFileSync(rulesFile,'utf8')):[];
 if(c.kind==='help')reply=controlHelp;
 if(c.kind==='status'){const prefs=JSON.parse(fs.readFileSync(path.join(root,'interaction-policy.json'),'utf8'));reply='主动聊天程度：'+prefs.level+'；主动称呼：'+prefs.nickname+'。\n'+['douyin','xiaohongshu','zhihu'].map(p=>{const s=inboxStatus(p,{root});return `${p} 检查${s.start}–${s.end}：${s.reason}`;}).join('\n')+'\n'+rules.map(r=>r.title+'：'+(r.enabled?'已启用':'已暂停')).join('\n')+'\n发“设置帮助”可看控制方式。';}
 if(c.kind==='tasks')reply=rules.map(r=>`${r.title}：${r.enabled?'已启用':'已暂停'}`).join('\n')||'暂无定时任务';
 if(c.kind==='requests'){
  const dir=path.join(root,'.state/schedule-requests');const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/\.json(?:\.done)?$/.test(f)).map(f=>({f,at:fs.statSync(path.join(dir,f)).mtimeMs})).sort((a,b)=>b.at-a.at).slice(0,5):[];
  reply=files.map(({f})=>{const r=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));return `${r.key} ${r.action}：${f.endsWith('.done')?'已由调度器处理':'待调度器处理'}`;}).join('\n')||'暂无控制请求';
 }
 if(c.kind==='task'){
  if(!rules.some(r=>r.key===c.key))reply='没有找到该定时任务，未修改。';
  else{const id=randomUUID();atomicJSON(path.join(root,'.state/schedule-requests',id+'.json'),{action:c.action,key:c.key,source:'verified-owner-chat',at:new Date().toISOString()});reply=`朋友，${c.name}定时任务的${c.action==='stop'?'暂停':'恢复'}请求已记录，调度器通常一分钟内处理。发“查看控制请求”可核对结果；现在还不能算已执行。`;}
 }
 await send(reply);return true;
}
export async function handleOwnerChat({platform,peer,text,quoted=false,group=false},{send}={}){
 if(quoted||group||!['qq','wechat'].includes(platform))return false;
 let owner=false;try{const b=JSON.parse(fs.readFileSync(path.join(workspace,'.state/shared-context/bindings.json'),'utf8'));owner=(b.owners?.[platform]||[]).includes(String(peer));}catch{}
 if(!owner)return false;
 if(platform==='wechat'){const activity=readJSON(activityFile,{sends:[]});activity.lastOwnerAt=Date.now();activity.lastOwnerPlatform='wechat';atomicJSON(activityFile,activity);}
 if(await handleInboxControl({platform,peer,text},{send}))return true;
 if(await handleAdditionalControl(text,{send}))return true;
 const command=parsePreference(text,preferences().level);if(!command)return false;
 await send(await applyPreference(command,{call:onebot}));return true;
}
