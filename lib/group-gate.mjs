import {directAddress} from './direct-address.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let classifier;
const lastWake=new Map();
export function setGroupClassifier(fn){classifier=fn;return()=>{if(classifier===fn)classifier=undefined;};}
export {directAddress} from './direct-address.mjs';
export function groupCandidate(inbound,policy,bot,now=Date.now()){
  if(inbound.kind!=='group'||!policy?.enabled||!bot||inbound.userId===bot)return false;
  if(inbound.replyId!==undefined||inbound.forwardId!==undefined||(!inbound.text?.trim()&&!inbound.media?.length)||inbound.text?.length>2000)return false;
  if(inbound.segments?.some(s=>s.type==='at'&&String(s.data?.qq)!==bot))return false;
  if(/\[CQ:at,qq=(?!all\b)(\d+)/.test(inbound.raw||'')&&!inbound.segments)return false;
  return true;
}
export function recentContext(messages,inbound,bot,seconds=180,now=Date.now()){
  const cutoff=now/1000-Math.min(900,Math.max(15,seconds));
  const rows=messages.filter(m=>Number(m.time)>=cutoff&&String(m.message_id)!==inbound.messageId)
    .filter(m=>!m.group_id||String(m.group_id)===inbound.groupId)
    .slice(-24).map(m=>({speaker:String(m.sender?.user_id??m.user_id??'')===bot?'bot':String(m.sender?.user_id??m.user_id??'')===inbound.userId?'current_user':'other',
      text:(typeof m.raw_message==='string'?m.raw_message:Array.isArray(m.message)?m.message.filter(s=>s.type==='text').map(s=>s.data?.text||'').join(''):'').replace(/\[CQ:[^\]]*\]/g,'').slice(0,600)}));
  return rows;
}
export function continuingDialogue(rows){
  const bot=rows.findLastIndex(r=>r.speaker==='bot');if(bot<0)return false;
  const preceding=rows.slice(0,bot).findLast(r=>r.speaker!=='bot');
  // A change of subject is still a conversation with the same person.
  return preceding?.speaker==='current_user'&&!rows.slice(bot+1).some(r=>r.speaker==='other');
}
export async function evaluateGroupWake(inbound,ctx,{policy,decide=classifier,now=Date.now()}={}){
  const bot=String(ctx.selfId()||ctx.config.botQQ||'');
  if(!groupCandidate(inbound,policy,bot,now))return {wake:false,reason:'outside-policy'};
  if(directAddress(inbound.text||'',policy.aliases||[]))return {wake:true,reason:'name-address'};
  if(now-(lastWake.get(inbound.groupId)||0)<(policy.cooldown_seconds??5)*1000)return {wake:false,reason:'cooldown'};
  const result=await ctx.call('get_group_msg_history',{group_id:Number(inbound.groupId),count:24});
  const rows=recentContext(result?.messages||[],inbound,bot,policy.context_seconds,now);
  if(continuingDialogue(rows))return {wake:true,reason:'ongoing-dialogue'};
  const hasBot=rows.some(r=>r.speaker==='bot');
  if(!hasBot&&!policy.proactive_join)return {wake:false,reason:'no-recent-bot'};
  if(!hasBot&&!/[?？]|有人|大家|游戏|动画|配置的固定音色|双城|AI|人工智能|抖音|小红书/i.test(inbound.text||''))return {wake:false,reason:'no-conversation-opening'};
  if(typeof decide!=='function')return {wake:false,reason:'classifier-unavailable'};
  const answer=await decide({history:rows,current:inbound.text?.slice(0,2000)||'[对方发了图片或表情]',allowJoin:policy.proactive_join===true});
  return {wake:(answer?.replyToBot===true&&Number(answer?.confidence)>=(policy.reply_threshold??0.72))||(policy.proactive_join===true&&answer?.joinConversation===true&&Number(answer?.confidence)>=0.9),reason:hasBot?'context-classifier':'topic-join'};
}
export async function groupWake(inbound,ctx){
  let policy;
  try{policy=JSON.parse(fs.readFileSync(path.join(root,'automation.json'),'utf8')).qq_groups?.[inbound.groupId];
    if(!policy?.enabled)return false;
    const result=await evaluateGroupWake(inbound,ctx,{policy});
    if(result.wake)lastWake.set(inbound.groupId,Date.now());
    const dir=path.join(root,'.state');fs.mkdirSync(dir,{recursive:true});
    fs.appendFileSync(path.join(dir,'group-listener.jsonl'),JSON.stringify({at:new Date().toISOString(),group:inbound.groupId,messageId:inbound.messageId,...result})+'\n',{mode:0o600});
    return result.wake;
  }catch(error){ctx.log('warn','指定群接话判断失败，本条保持静默：'+String(error.message).slice(0,120));return false;}
}
