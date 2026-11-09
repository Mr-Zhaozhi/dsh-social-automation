// Recover only an existing background message panel; never create/activate a tab.
export function recoverClosedPanel(original,{allowed=()=>false,now=Date.now,report=()=>{},cooldownMs=300000}={}){
 const attempts=new WeakMap();
 return async function(id,options={}){
  try{return await original.call(this,id,options);}catch(error){
   if(error.code!=='CHAT_PAGE_NOT_OPEN'||options.backgroundOnly!==true||!await allowed()||now()-(attempts.get(this)??-Infinity)<cooldownMs)throw error;
   attempts.set(this,now());
   await this.withPage(async page=>{
    options.signal?.throwIfAborted();if(!await allowed())throw error;
    if(await this.isForeground(page))throw Object.assign(Error('用户正在操作专用浏览器，未打开消息面板'),{code:'CHAT_FOREGROUND'});
    const state=await this.dialog(page,options.signal,{open:true});
    if(state?.blocked||state?.loginRequired||state?.verificationRequired)throw error;
   },{signal:options.signal,launch:false,create:false});
   report({state:'panel-restored',at:new Date(now()).toISOString()});
   return original.call(this,id,options);
  }
 };
}
