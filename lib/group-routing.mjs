import {AsyncLocalStorage} from 'node:async_hooks';
import {directAddress} from './group-dialogue.mjs';
import {groupCandidate} from './group-gate.mjs';
import {parseGroupCommand,applyGroupCommand} from './group-commands.mjs';
import {verifiedOwner,readSmall} from './quick-query.mjs';
export function groupRouting(original,{root,onEvent=()=>{}}={}){
 return async function(inbound){
  const command=parseGroupCommand(inbound.text);
  let scoped=this;
  if(inbound.kind==='group'){
   let policy;try{policy=readSmall(root,'automation.json').qq_groups?.[inbound.groupId];}catch{}
   const bot=String(this.ctx.selfId()||this.ctx.config.botQQ||'');
   if(this.ctx.config.requireMention&&groupCandidate(inbound,policy,bot)&&directAddress(inbound.text||'',policy.aliases||[])){
    scoped=Object.create(this);scoped.ctx=Object.create(this.ctx);scoped.ctx.config={...this.ctx.config,requireMention:false};
    onEvent({kind:'direct-address',group:inbound.groupId,messageId:inbound.messageId});
   }
  }else if(command&&inbound.kind==='private'&&inbound.replyId===undefined&&inbound.forwardId===undefined&&!(inbound.media||[]).length&&verifiedOwner('qq',inbound.userId,root)){
   scoped=Object.create(this);scoped.ctx=Object.create(this.ctx);
   if(this.ctx.getChat)scoped.ctx.getChat=(...args)=>{const chat=this.ctx.getChat(...args);return chat?new Proxy(chat,{set(target,key,value){return ['loopBuffer','loopPending'].includes(key)||Reflect.set(target,key,value);}}):chat;};
   scoped.ctx.interceptBusyTurn=async()=>false;
   scoped.ctx.dispatchFollowup=async()=>{const reply=await applyGroupCommand(command,{root,call:(...args)=>this.ctx.call(...args)});await this.ctx.call('send_private_msg',{user_id:Number(inbound.userId),message:[{type:'text',data:{text:reply}}]});onEvent({kind:'group-control',platform:'qq',modelCalled:false});};
  }
  return original.call(scoped,inbound);
 };
}
export function groupWeChatRouting(processMessage,tryNativeCommand,{root,call,onEvent=()=>{}}={}){
 const store=new AsyncLocalStorage();
 return {
  processMessage:async function(msg){return store.run(msg,()=>processMessage.call(this,msg));},
  tryNativeCommand:async function(user,userId,text){
   const msg=store.getStore(),items=msg?.item_list||[],command=parseGroupCommand(text);
   if(command&&msg?.message_type===1&&!msg.group_id&&msg.from_user_id===userId&&items.length===1&&items[0].type===1&&!items[0].ref_msg&&verifiedOwner('wechat',userId,root)){
    await this.sendReply(userId,await applyGroupCommand(command,{root,call}));onEvent({kind:'group-control',platform:'wechat',modelCalled:false});return true;
   }
   return tryNativeCommand.call(this,user,userId,text);
  }
 };
}
