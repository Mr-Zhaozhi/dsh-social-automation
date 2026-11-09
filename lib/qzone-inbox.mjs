// Beijing wall-clock slots. Late startup catches the current slot once, never overnight.
export function qzoneSlot(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const m=Number(p.hour)*60+Number(p.minute);
 if(m<600||m>=1410)return null;
 return `${p.year}-${p.month}-${p.day}:${10+2*Math.floor((m-600)/120)}`;
}
export function incomingComments(post,comments,self,since){
 const rows=[];
 for(const c of comments){
  const add=(v,id,reply=false)=>{
   if(id==null||!v.user_id||String(v.user_id)===String(self)||!v.content||Number(v.time)*1000<since)return;
   if(reply&&String(v.target_user_id)!==String(self))return;
   if(!c.comment?.user?.uin)return;
   rows.push({key:`${post.tid}:${c.comment_id}:${reply?id:'root'}`,feed_ref:post.feed_ref,comment:{...c.comment,id:String(c.comment.id)},reply_user:{uin:String(v.user_id),nick:v.nickname||''},text:v.content,post:post.content||'',time:v.time});
  };
  add(c,c.comment_id);for(const r of c.replies||[])add(r,r.reply_id,true);
 }
 return rows;
}
