import fs from 'node:fs';import path from 'node:path';
import {workspace,atomicJSON,day} from './runtime.mjs';
import {handleInboxControl,parseInboxCommand} from './inbox-policy.mjs';
import {parseGroupCommand,applyGroupCommand} from './group-commands.mjs';
export const policyFile=path.join(workspace,'interaction-policy.json');
export const activityFile=path.join(workspace,'.state/companion.json');
export const readJSON=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):fallback;
export function preferences(){return {...{version:1,level:70,nickname:'朋友',quietStart:23,quietEnd:9},...readJSON(policyFile,{})};}
export function settingsFor(level){
 if(level<=0)return {enabled:false,maxPerDay:0,idleMinutes:120,gapMinutes:240};
 if(level<=30)return {enabled:true,maxPerDay:2,idleMinutes:120,gapMinutes:180};
 if(level<=60)return {enabled:true,maxPerDay:5,idleMinutes:40,gapMinutes:80};
 if(level<=85)return {enabled:true,maxPerDay:8,idleMinutes:20,gapMinutes:45};
 return {enabled:true,maxPerDay:12,idleMinutes:8,gapMinutes:25};
}
export function parsePreference(text,current=70){
 const groupCommand=parseGroupCommand(text);if(groupCommand)return groupCommand;
 const t=String(text).trim().replace(/^(?:小伴[，,\s]*)/,'').replace(/[。！!]+$/,'');
 if(/^(?:现在|你现在|查看|看看)?(?:的)?主动(?:程度|设置|频率)(?:是多少|怎么样|多少)?[？?]?$/.test(t))return {kind:'status'};
 const nickname=t.match(/^(?:以后)?(?:叫我|称呼我)([^\s“”\"'<>\[\]{}\n]{1,12})$/);
 if(nickname)return {kind:'nickname',nickname:nickname[1]};
 if(/^主动聊天时间(?:改成|改为|设为)/.test(t)){
  const window=parseInboxCommand(t.replace(/^主动聊天时间/,'检查时间'));
  return window?.kind==='window'&&window.startMinute%60===0&&window.endMinute%60===0?{kind:'quiet',quietStart:window.endMinute/60%24,quietEnd:window.startMinute/60}:{kind:'invalid-window'};
 }
 if(/^(?:把|将|你的)?主动(?:程度|度)(?:再)?(?:提高|调高|加高|高|加大)(?:一点|点|一些|些)(?:吧)?$/.test(t)||/^(?:以后|你)?(?:多主动找我(?:闲聊|聊天)|更主动些|主动找我闲聊)$/.test(t))return {kind:'level',level:Math.min(100,current+20)};
 if(/^(?:把|将)?主动(?:程度|度)(?:拉满|开到最高)$/.test(t))return {kind:'level',level:100};
 const exact=t.match(/^(?:把|将|你的|你)?主动(?:程度|频率)(?:给我|帮我)?(?:调到|设为|设置为|改成)?\s*(\d{1,3})\s*%?$/);
 if(exact){const level=Number(exact[1]);if(level>100)return {kind:'invalid'};return {kind:'level',level};}
 if(/^(?:你|以后|请|给我|再|可以|能不能|稍微|平时|也|要|都|多|点|一点|些|更|再|来|找我|聊天|消息|发|的|了|吧|啊|，|,|\s)*(?:主动一点|主动点|积极一点|多找我聊聊)(?:吧|啊|哦|嘛|可以吗|好吗)?[？?]?$/.test(t))return {kind:'level',level:Math.min(100,current+20)};
 if(/^(?:你|以后|请|给我|再|可以|能不能|稍微|平时|也|要|，|,|\s)*(?:少主动一点|少主动点|别那么主动|少来找我|少发一点)(?:吧|啊|哦|消息|好吗)?[？?]?$/.test(t))return {kind:'level',level:Math.max(10,current-20)};
 if(/^(?:你|以后|请|先|暂时|，|,|\s)*(?:别主动找我|不要主动找我|安静模式|关闭主动聊天|暂停主动聊天)(?:了|吧|啊)?$/.test(t))return {kind:'level',level:0};
 if(/^(?:恢复主动聊天|开启主动聊天|恢复主动消息)$/.test(t))return {kind:'level',level:70};
 if(/^查看主动群$/.test(t))return {kind:'groups'};
 return null;
}
export function eligibility(state,prefs,now=Date.now(),date=day()){
 const rule=settingsFor(prefs.level),hour=new Date(now+8*3600000).getUTCHours();
 if(!rule.enabled)return {due:false,reason:'disabled'};
 if(now<(state.modelRetryAt||0))return {due:false,reason:'model-backoff',nextAt:state.modelRetryAt};
 if(prefs.quietStart===prefs.quietEnd?false:prefs.quietStart<prefs.quietEnd?hour>=prefs.quietStart&&hour<prefs.quietEnd:hour>=prefs.quietStart||hour<prefs.quietEnd)return {due:false,reason:'quiet-hours'};
 const sends=(state.sends||[]).filter(s=>s.status!=='not-sent');
 if(sends.some(s=>(s.status==='pending'||s.status==='unknown')&&now-s.at<86400000))return {due:false,reason:'delivery-needs-review'};
 if(sends.filter(s=>s.date===date).length>=rule.maxPerDay)return {due:false,reason:'daily-cap'};
 if(sends.filter(s=>!s.testId&&s.at>(state.lastOwnerAt||0)).length>=2)return {due:false,reason:'waiting-owner'};
 const lastActivity=state.lastOwnerAt||0;
 if(now-lastActivity<rule.idleMinutes*60000)return {due:false,reason:'recent-chat',nextAt:lastActivity+rule.idleMinutes*60000};
 if(now-(state.lastBotAt||0)<120000)return {due:false,reason:'just-replied',nextAt:state.lastBotAt+120000};
 if(now-(sends.at(-1)?.at||0)<rule.gapMinutes*60000)return {due:false,reason:'cooldown',nextAt:sends.at(-1).at+rule.gapMinutes*60000};
 if(now<(state.nextCheckAt||0))return {due:false,reason:'next-check'};
 return {due:true,rule};
}
export function observeMessage(inbound){
 const config=readJSON(path.join(workspace,'automation.json'),{});
 if(inbound.kind!=='private'||String(inbound.userId)!==String(config.owner_qq))return;
 const state=readJSON(activityFile,{sends:[]});state.lastOwnerAt=Date.now();state.lastOwnerMessageId=inbound.messageId;atomicJSON(activityFile,state);
}
export async function ownerControl(inbound,ctx){
 const cfg=readJSON(path.join(workspace,'automation.json'),{});
 if(inbound.kind!=='private'||String(inbound.userId)!==String(cfg.owner_qq)||inbound.replyId||inbound.forwardId)return false;
 if(await handleInboxControl({platform:'qq',peer:inbound.userId,text:inbound.text},{send:reply=>ctx.call('send_private_msg',{user_id:Number(cfg.owner_qq),message:[{type:'text',data:{text:reply}}]})}))return true;
 const {handleAdditionalControl}=await import('./chat-controls.mjs');
 if(await handleAdditionalControl(inbound.text,{send:reply=>ctx.call('send_private_msg',{user_id:Number(cfg.owner_qq),message:[{type:'text',data:{text:reply}}]})}))return true;
 const command=parsePreference(inbound.text,preferences().level);if(!command)return false;
 const reply=await applyPreference(command,ctx);
 await ctx.call('send_private_msg',{user_id:Number(cfg.owner_qq),message:[{type:'text',data:{text:reply}}]});return true;
}
export async function applyPreference(command,ctx){
 if(command.kind==='group')return applyGroupCommand(command,{call:(...args)=>ctx.call(...args)});
 const prefs=preferences(),cfg=readJSON(path.join(workspace,'automation.json'),{});
 let reply;
 if(command.kind==='nickname'){prefs.nickname=command.nickname;atomicJSON(policyFile,prefs);reply=`好，以后称呼你${prefs.nickname}。聊起来自然一点，不会句句硬加称呼。`;}
 else if(command.kind==='quiet'){Object.assign(prefs,{quietStart:command.quietStart,quietEnd:command.quietEnd});atomicJSON(policyFile,prefs);reply=`${prefs.nickname}，主动找你聊天的时段已改为北京时间${prefs.quietEnd}:00到${prefs.quietStart===0?24:prefs.quietStart}:00；收到你的消息照常回复。`;}
 else if(command.kind==='invalid-window')reply='主动聊天时段目前支持整点，例如“主动聊天时间改成每天10:00到23:00”。';
 else if(command.kind==='level'){
  prefs.level=command.level;const activity=readJSON(activityFile,{sends:[]});delete activity.nextCheckAt;atomicJSON(activityFile,activity);prefs.updatedAt=new Date().toISOString();atomicJSON(policyFile,prefs);const s=settingsFor(prefs.level);
  reply=s.enabled?`收到，朋友。主动程度调到 ${prefs.level}，你闲下来约 ${s.idleMinutes} 分钟我就可以找话题，两次主动消息至少隔 ${s.gapMinutes} 分钟，每天最多 ${s.maxPerDay} 次；连续两次没接话就停。`:'好，朋友，我先安静待着。你找我时照常聊。';
 }else if(command.kind==='status'){const s=settingsFor(prefs.level);const status=eligibility(readJSON(activityFile,{sends:[]}),prefs);const reasons={'recent-chat':'刚聊过，等你闲下来','just-replied':'刚回复过，稍等两分钟','quiet-hours':'主动聊天休息时段','waiting-owner':'已有两次主动消息未获回应','daily-cap':'今天主动消息已达上限','cooldown':'两次主动消息间隔中','next-check':'上一轮暂时没有合适话题','delivery-needs-review':'上次发送结果需要核对','disabled':'你已关闭主动聊天'};reply=`朋友，现在主动程度是 ${prefs.level}。${s.enabled?`每天最多主动找你 ${s.maxPerDay} 次，北京时间${prefs.quietStart}:00到${prefs.quietEnd}:00不主动打扰。`:'主动找你已暂停，你发消息我照常回复。'} 当前：${status.due?'可以主动找话题':reasons[status.reason]||status.reason}。`;}
 else if(command.kind==='invalid')reply='朋友，主动程度用0到100就行，0表示先别主动找你。';
 else if(command.kind==='groups')reply='现在开启主动接话的群：'+Object.entries(cfg.qq_groups||{}).filter(([,v])=>v.enabled).map(([id,v])=>`${v.name}（${id}）`).join('、');
 else throw new Error('未知聊天设置指令');

 return reply;
}

export function configuredGroup(id){return readJSON(path.join(workspace,'automation.json'),{}).qq_groups?.[String(id)]?.enabled===true;}
