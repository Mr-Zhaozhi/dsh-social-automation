// Child processes report whether a write was actually dispatched.
export function cliFailure(error){
 try{const result=JSON.parse(String(error.stdout||'').trim());if(result.error&&typeof result.deliveryUncertain==='boolean'){error.beforeDelivery=!result.deliveryUncertain;error.message=result.error;if(result.code==='INBOX_RESTING')error.code=result.code;}}
 catch{}
 return error;
}
export function recordReplyFailure(state,key,error,original){
 const prior=state.deliveries[key]||{},attempts=(original.attempts||0)+(error.code==='INBOX_RESTING'?0:1);
 state.deliveries[key]={...prior,status:error.beforeDelivery?'not-sent':'unknown',error:String(error.message).slice(-350),attempts};
 if(error.beforeDelivery&&attempts<3&&!state.queue.some(x=>(x.key||x.message?.id)===key))state.queue.push({...original,attempts});
}
