import {AsyncLocalStorage} from 'node:async_hooks';
import {quickKind,quickReply,verifiedOwner} from './quick-query.mjs';
export function quickQQHandler(original,{root,onReply=()=>{}}={}){
 return async function(inbound){
  const kind=quickKind(inbound.text);
  if(!kind||inbound.kind!=='private'||inbound.replyId!==undefined||inbound.forwardId!==undefined||(inbound.media||[]).length||!verifiedOwner('qq',inbound.userId,root))return original.call(this,inbound);
  const scoped=Object.create(this);scoped.ctx=Object.create(this.ctx);
  // A read-only query must not discard buffered output from a running task.
  if(this.ctx.getChat)scoped.ctx.getChat=(...args)=>{
   const chat=this.ctx.getChat(...args);if(!chat)return chat;
   return new Proxy(chat,{set(target,key,value){if(key==='loopBuffer'||key==='loopPending')return true;return Reflect.set(target,key,value);}});
  };
  // Dispatch seam is after native fleet, allowlist, dedup, rate-limit and question handling.
  scoped.ctx.interceptBusyTurn=async()=>false;
  scoped.ctx.dispatchFollowup=async()=>{await this.ctx.call('send_private_msg',{user_id:Number(inbound.userId),message:[{type:'text',data:{text:quickReply(kind,{root})}}]});onReply('qq',kind);};
  return original.call(scoped,inbound);
 };
}
export function quickWeChatHandlers(processMessage,tryNativeCommand,{root,onReply=()=>{}}={}){
 const incoming=new AsyncLocalStorage();
 return {
  processMessage:async function(msg){return incoming.run(msg,()=>processMessage.call(this,msg));},
  tryNativeCommand:async function(user,userId,text){
   const m=incoming.getStore(),items=m?.item_list||[],kind=quickKind(text);
   if(kind&&m?.message_type===1&&!m.group_id&&m.from_user_id===userId&&items.length===1&&items[0].type===1&&!items[0].ref_msg&&verifiedOwner('wechat',userId,root)){
    // Native peer auth, fresh context token, dedup and pending-card processing already ran.
    await this.sendReply(userId,quickReply(kind,{root}));onReply('wechat',kind);return true;
   }
   return tryNativeCommand.call(this,user,userId,text);
  }
 };
}
