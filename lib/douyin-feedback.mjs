import {inspectVideo} from './douyin-surface.mjs';
export function wantsNegativeFeedback(decision){
 return ['skip','search'].includes(decision?.action)&&Array.isArray(decision.topics)&&decision.topics.some(t=>t.signal==='dislike')&&!decision.topics.some(t=>t.signal==='like');
}
export function canFeedback(rows,videoId,{now=Date.now(),date}={}){
 return /^\d{10,30}$/.test(videoId||'')&&!rows.some(r=>r.videoId===videoId)&&rows.filter(r=>r.date===date&&['pending','confirmed','unknown'].includes(r.status)).length<20&&!rows.some(r=>['pending','confirmed','unknown'].includes(r.status)&&now-r.at<60000);
}
// Only an explicitly labeled control is allowed. No reporting, blocking or hidden API.
export async function negativeFeedback(page,videoId,{authorize,record,inspect=inspectVideo}={}){
 let opened=false,dispatched=false;
 const result=(status,reason)=>{const value={videoId,status,reason};record(value);return value;};
 try{
  await authorize();const state=await inspect(page,videoId);
  const root=page.locator(state.kind==='detail'?'[data-e2e="video-detail"]':'[data-e2e="feed-active-video"]').filter({visible:true});
  if(await root.count()!==1)return result('not-sent','ambiguous-player');
  let target=root.getByRole('button',{name:'不感兴趣',exact:true}).filter({visible:true});
  if(await target.count()!==1){
   const more=root.locator('[data-e2e="video-play-more"]').filter({visible:true});
   if(await more.count()!==1)return result('not-sent','control-unavailable');
   await more.hover({timeout:2500});opened=true;
   target=more.getByText('不感兴趣',{exact:true}).filter({visible:true});
   if(await target.count()!==1)target=page.getByRole('menuitem',{name:'不感兴趣',exact:true}).filter({visible:true});
   if(await target.count()!==1){target=page.getByRole('menu').getByText('不感兴趣',{exact:true}).filter({visible:true});}
  }
  if(await target.count()!==1)return result('not-sent','control-unavailable');
  await target.click({trial:true,timeout:2500});await authorize();await inspect(page,videoId);
  result('pending','click-starting');dispatched=true;
  await target.click({timeout:3000});
  const receipt=page.getByText(/^(已减少类似作品推荐|将减少类似作品推荐|将减少类似内容推荐|将减少此类内容推荐|不感兴趣反馈成功)$/).filter({visible:true}).first();
  try{await receipt.waitFor({state:'visible',timeout:4000});return result('confirmed','visible-feedback-receipt');}catch{return result('unknown','no-explicit-receipt');}
 }catch(error){result(dispatched?'unknown':'not-sent',dispatched?'click-result-unconfirmed':error.code||'preflight-failed');if(dispatched)return {videoId,status:'unknown'};throw error;}
 finally{if(opened)await page.keyboard.press('Escape').catch(()=>{});}
}
