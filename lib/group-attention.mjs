import {botAliases,directAddress,mentionsBot} from './group-addressing.mjs';
import {groupCandidate,recentContext,continuingDialogue} from './group-gate.mjs';
export function compactHistory(rows){
 let left=3000;return rows.slice(-12).reverse().map(r=>{const text=String(r.text||'').slice(0,Math.min(240,left));left-=text.length;return {speaker:r.speaker,text};}).filter(r=>r.text).reverse();
}
export async function evaluateAttention(inbound,ctx,{policy,decide,allowClassification=()=>true,now=Date.now()}={}){
 const bot=String(ctx.selfId()||ctx.config.botQQ||'');
 if(!groupCandidate(inbound,policy,bot))return {wake:false,reason:'outside-policy'};
 const aliases=botAliases(policy.aliases||['小伴']),text=inbound.text||'';
 if(mentionsBot(text,aliases)&&/(?:别|不要|不用|先别)(?:再)?(?:接话|插话|回复|说话)|闭嘴/.test(text))return {wake:false,reason:'asked-to-stay-quiet',modelCalled:false};
 if(directAddress(text,aliases))return {wake:true,reason:'direct-name',modelCalled:false};
 if(/^\s*\//.test(text))return {wake:false,reason:'unaddressed-command',modelCalled:false};
 const response=await ctx.call('get_group_msg_history',{group_id:Number(inbound.groupId),count:24});
 const rows=recentContext(response?.messages||[],inbound,bot,policy.context_seconds,now),hasBot=rows.some(r=>r.speaker==='bot');
 if(continuingDialogue(rows))return {wake:true,reason:'ongoing-dialogue',modelCalled:false};
 const named=mentionsBot(text,aliases),opening=/[?？]|有人|大家|游戏|动画|配置的固定音色|双城|AI|人工智能|抖音|小红书/i.test(text);
 if(!named&&!hasBot&&(!policy.proactive_join||!opening))return {wake:false,reason:'unrelated',modelCalled:false};
 if(typeof decide!=='function')return {wake:false,reason:'classifier-unavailable',modelCalled:false};
 if(!allowClassification(inbound.groupId,now))return {wake:false,reason:'classifier-budget',modelCalled:false};
 const a=await decide({aliases,history:compactHistory(rows),current:text.slice(0,1200)||'[图片或表情]',mentionsBot:named,allowJoin:policy.proactive_join===true});
 const confidence=Number(a?.confidence),reply=a?.replyToBot===true&&confidence>=(policy.reply_threshold??.72);
 const about=named&&a?.aboutBot===true&&a?.participate===true&&confidence>=.8;
 const topic=hasBot&&a?.continuesBotTopic===true&&a?.participate===true&&confidence>=.8;
 const join=policy.proactive_join===true&&a?.joinConversation===true&&confidence>=.9;
 return {wake:reply||about||topic||join,reason:reply?'reply-to-bot':about?'discussing-bot':topic?'bot-topic':join?'topic-join':'context-not-for-bot',modelCalled:true};
}
export function attentionRouting(original,{readPolicy,decide,allowClassification,onEvent=()=>{}}){
 return async function(inbound){
  const policy=readPolicy(inbound.groupId),bot=String(this.ctx.selfId()||this.ctx.config.botQQ||'');
  const explicit=inbound.segments?.some(s=>s.type==='at')||/\[CQ:at,/.test(inbound.raw||'');
  if(!this.ctx.config.requireMention||explicit||!groupCandidate(inbound,policy,bot))return original.call(this,inbound);
  const scoped=Object.create(this);scoped.ctx=Object.create(this.ctx);scoped.ctx.config={...this.ctx.config,requireMention:false};
  if(this.ctx.getChat)scoped.ctx.getChat=(...args)=>{const chat=this.ctx.getChat(...args);return chat?new Proxy(chat,{set(target,key,value){return ['loopBuffer','loopPending'].includes(key)||Reflect.set(target,key,value);}}):chat;};
  // After native fleet, dedup and authorization, before dispatch. Never bypass native gates.
  scoped.ctx.tryHandleCommand=async(...args)=>{
   let decision;try{decision=await evaluateAttention(inbound,this.ctx,{policy,decide,allowClassification});}catch{decision={wake:false,reason:'attention-unavailable'};}
   onEvent({group:inbound.groupId,messageId:inbound.messageId,...decision});
   if(!decision.wake)return true;
   return this.ctx.tryHandleCommand(...args);
  };
  return original.call(scoped,inbound);
 };
}
