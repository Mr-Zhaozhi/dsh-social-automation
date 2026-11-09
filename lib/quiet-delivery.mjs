// Preserve the original bridge's deduplication and host-card handling.
export function quietAssistantHandler(original) {
  return function(chatId, chat, message) {
    const text=message.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    const toolStep=message.content.some(b=>b.type==='tool-call');
    const silent=text.trim()==='<HUOHUO_NO_TEXT>'&&!toolStep;
    if(silent||!this.ctx.effectiveInterim(chatId)&&(toolStep||!text.trim())){
      chat.loopPending=null;
      return original.call(this,chatId,chat,{...message,content:message.content.filter(b=>b.type!=='text')});
    }
    return original.call(this,chatId,chat,message);
  };
}
