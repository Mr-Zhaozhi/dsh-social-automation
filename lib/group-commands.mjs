import fs from 'node:fs';import path from 'node:path';
import {workspace,atomicJSON} from './runtime.mjs';
export function parseGroupCommand(input){
 const raw=String(input||'').trim();
 if(raw.length>140||/[\n\r“”"'<>\[\];；?？]/.test(raw)||/并且|然后|顺便|同时/.test(raw))return null;
 const t=raw.replace(/^(?:小伴|霍霍)[，,\s]*/,'').replace(/^(?:请|帮我)\s*/,'').replace(/[。！!]+$/,'');
 let m=t.match(/^(新增|开启|关闭|取消)主动群\s*[：:]?\s*(.+)$/);
 if(m)return {kind:'group',enabled:['新增','开启'].includes(m[1]),target:m[2].trim()};
 m=t.match(/^(?:给|把|将|让)\s*(.+?)\s*(?:加入|添加到|加到|设为|设置为|开启)主动群(?:吧)?$/);
 if(m)return {kind:'group',enabled:true,target:m[1].trim()};
 m=t.match(/^(?:把|将|让)\s*(.+?)\s*(?:从主动群(?:中)?(?:移除|删除)|移出主动群|取消主动接话|关闭主动接话)(?:吧)?$/);
 if(m)return {kind:'group',enabled:false,target:m[1].trim()};
 return null;
}
export async function applyGroupCommand(command,{root=workspace,call,timeoutMs=6000}={}){
 if(command?.kind!=='group'||typeof command.enabled!=='boolean'||typeof command.target!=='string'||!command.target.trim())throw Error('无效群设置指令');
 let timer,groups;
 try{groups=await Promise.race([Promise.resolve().then(()=>call('get_group_list',{})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('group-list-timeout')),timeoutMs);})]);}
 catch{return '朋友，群列表暂时没有取到，这次没有修改。稍后再说“新增主动群 群号”即可。';}
 finally{clearTimeout(timer);}
 const matches=(Array.isArray(groups)?groups:[]).filter(g=>String(g.group_id)===command.target||g.group_name===command.target);
 if(matches.length!==1)return '朋友，没有找到唯一的已加入群，这次没有修改。请用群号；也要先把我拉进群。';
 const g=matches[0],id=String(g.group_id),file=path.join(root,'automation.json');
 try{
  // Read AFTER the network call so other settings changed while waiting are preserved.
  const cfg=JSON.parse(fs.readFileSync(file,'utf8'));cfg.qq_groups||={};
  const before=cfg.qq_groups[id]||{};
  cfg.qq_groups[id]={context_seconds:600,cooldown_seconds:1,reply_threshold:.72,proactive_join:true,...before,name:g.group_name,enabled:command.enabled,aliases:[...new Set([...(Array.isArray(before.aliases)?before.aliases:[]),'小伴','霍霍'])]};
  atomicJSON(file,cfg);
  if(JSON.parse(fs.readFileSync(file,'utf8')).qq_groups?.[id]?.enabled!==command.enabled)throw Error('readback-mismatch');
  return command.enabled?`朋友，${g.group_name}（${id}）已开启主动接话。可以不艾特，直接说“小伴出来聊天”或“霍霍出来聊天”；正在和我对话时也能接着聊，不会每条群消息都插话。`:`朋友，${g.group_name}（${id}）已关闭主动接话。没有退出QQ群；之后需要艾特我。`;
 }catch{return '朋友，群设置保存或回读没有确认成功，不能算已开好，需要核对配置。';}
}
