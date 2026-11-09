// A pending local row can become server-confirmed after the tracker's new-tail pass.
// Accept that late acknowledgment only with a new ID, exact text and server time.
export function confirmedOutgoing(item,{text,beforeIds,dispatchedAt,now=Date.now()}){
 if(item.direction!=='outgoing'||item.text!==text.trim()||!item.id||beforeIds.has(item.id)||item.failed||item.pending||item.serverConfirmed===false)return false;
 if(item.arrivalClassification==='new-tail')return true;
 const at=Date.parse(item.nativeCreatedAt);
 return item.serverConfirmed===true&&item.nativeServerMessageBound===true&&Number.isFinite(dispatchedAt)&&Number.isFinite(at)&&at>=dispatchedAt-1500&&at<=now+1500;
}
