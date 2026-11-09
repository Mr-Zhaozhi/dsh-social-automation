// Shared history refreshes on a new user turn, not after every assistant tool step.
// An identity/binding change invalidates immediately even during an existing turn.
export class TurnContextSnapshots {
 constructor(){this.entries=new Map();}
 observe(sessionId,event){
  if(event.type==='turn/start'||event.type==='user/message'&&['user','plugin:dsh-onebot'].includes(event.data?.source?.kind))this.entries.delete(sessionId);
 }
 read(sessionId,route,render){
  const key=JSON.stringify(route),entry=this.entries.get(sessionId);
  if(entry?.key===key)return entry.text;
  const text=render();this.entries.set(sessionId,{key,text});
  if(this.entries.size>128)this.entries.delete(this.entries.keys().next().value);
  return text;
 }
 clear(){this.entries.clear();}
}
