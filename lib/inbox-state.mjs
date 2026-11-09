// Establish a baseline once; only new incoming messages can cause public actions.
export function incomingCandidates(state,conversations){
 state.seen||={};const candidates=[];
 for(const c of conversations){
  const last=c.messages?.at(-1);if(!last?.id)continue;
  const key=String(c.uid),previous=state.seen[key];
  if(state.initialized&&!last.mine&&!last.failed&&!last.unsupported&&previous!==last.id&&!state.deliveries?.[last.id])candidates.push({...c,message:last});
  state.seen[key]=last.id;
 }
 state.initialized=true;return candidates;
}
export function replyDecision(result){
 return result?.reply===true&&typeof result.text==='string'&&result.text.trim()&&[...result.text].length<=180?result.text.trim():null;
}
export function freshComment(n){return /^(刚刚|\d{1,2}分钟前|(?:[1-9]|1\d|2[0-3])小时前|昨天(?:\s*\d{1,2}:\d{2})?|\d{1,2}:\d{2})$/.test(n.time||'')&&!/(拼车|车找人|人找车|顺风车|退款|付款|转账|多少钱|有座|拉黑|(?:不要|别).*(?:评论|回复))/.test(n.text+' '+n.quote);}
