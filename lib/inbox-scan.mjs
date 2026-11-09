export function contactSignature(c){return JSON.stringify([c.preview||'',c.messageId||'']);}
export function changedContacts(state,contacts){
 const selected=contacts.filter(c=>c.unread||(state.initialized&&(Object.hasOwn(state.contacts||{},c.uid)?state.contacts[c.uid]!==contactSignature(c):/^(刚刚|\d+分钟前|\d{1,2}:\d{2})$/.test(c.time||''))));
 return selected;
}
export function acceptContactSnapshot(state,contacts,opened){
 state.contacts||={};const selected=new Set(opened);
 for(const c of contacts)if(!state.initialized||selected.has(c.uid))state.contacts[c.uid]=contactSignature(c);
 state.initialized=true;
}
