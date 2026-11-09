// Only automation-owned, abandoned temporary tabs are eligible for recovery.
export const temporaryLabel=(pid=process.pid,now=Date.now())=>`huohuo:temporary:${pid}:${now}`;
export function abandonedTemporary(name,alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}){
 const m=/^huohuo:(?:temporary|xhs-browse|zhihu-browse|xhs-interaction|xhs-notifications|douyin-notifications):(\d+):(\d+)$/.exec(name||'');return !!m&&!alive(Number(m[1]));
}
export function protectedPage(url,name=''){
 return /publish|inbox|chat/i.test(name)||/creator\.(douyin|xiaohongshu)\.com|\/chat(?:[/?]|$)|\/im(?:[/?]|$)/i.test(url);
}
export async function snapshot(page){
 let timer;try{return await Promise.race([page.evaluate(()=>({name:window.name,dirty:[...document.querySelectorAll('textarea,[contenteditable=true],input:not([type=hidden]):not([type=search])')].some(e=>String(e.value||e.innerText||'').trim())})),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1500);})]);}catch{return null;}finally{clearTimeout(timer);}
}
export async function releasePage(page){
 if(!page||page.isClosed())return false;
 const s=await snapshot(page);if(!s||s.dirty||protectedPage(page.url(),s.name))return false;
 await page.close();return true;
}
export async function recoverTemporaryPages(context){
 let closed=0;
 for(const p of context.pages()){
  if(p.isClosed()||protectedPage(p.url()))continue;
  const s=await snapshot(p);
  if(s&&!s.dirty&&!protectedPage(p.url(),s.name)&&abandonedTemporary(s.name)){
   await p.close().then(()=>closed++).catch(()=>{});
  }
 }
 return closed;
}
