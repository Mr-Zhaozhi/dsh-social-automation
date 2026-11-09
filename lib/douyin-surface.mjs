// Runs in the page. Bind actions to the actual visible player, never sidebar links.
export function readVideoSurface(){
 const fail=reason=>({supported:false,reason});
 if(location.origin!=='https://www.douyin.com')return fail('不是抖音作品页');
 const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();if(r.width<=0||r.height<=0||r.bottom<=0||r.right<=0||r.top>=innerHeight||r.left>=innerWidth)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}return true;};
 if([...document.querySelectorAll('[data-e2e="im-dialog"],#captcha_container,[id^="captcha_container"],[data-e2e="captcha-container"]')].some(visible))return fail('私信或验证界面正在显示');
 const videos=[...document.querySelectorAll('video')].filter(v=>visible(v)&&!v.closest('[data-e2e="im-dialog"],[data-e2e="conversation-item"]'));
 if(videos.length!==1)return fail('当前可见视频不唯一');
 const video=videos[0],root=video.closest('[data-e2e="feed-active-video"],[data-e2e="video-detail"]');if(!root)return fail('当前视频没有可核对的作品容器');
 const kind=root.getAttribute('data-e2e')==='video-detail'?'detail':'feed';
 const classId=e=>/(?:^|\s)video_(\d+)(?:\s|$)/.exec(e?.getAttribute('class')||'')?.[1];
 const ids=[classId(video.closest('[data-e2e="player-container"]')),classId(root),root.getAttribute('data-e2e-vid'),root.getAttribute('data-video-id')].filter(Boolean);
 const route=new URL(location.href),routeId=route.searchParams.get('modal_id')||route.searchParams.get('aweme_id')||/^\/video\/(\d+)\/?$/.exec(route.pathname)?.[1];
 if(routeId)ids.push(routeId);const unique=[...new Set(ids)];if(unique.length!==1||!/^\d{1,64}$/.test(unique[0]))return fail('作品编号缺失或互相矛盾');
 const id=unique[0],buttons=[...root.querySelectorAll('[data-e2e="video-player-digg"]')];
 const states=buttons.map(e=>{const s=e.getAttribute('data-e2e-state');if(s==='video-player-no-digged')return false;if(s==='video-player-is-digged'||s==='video-player-digged')return true;const a=e.getAttribute('aria-pressed');return a==='true'?true:a==='false'?false:null;});
 const liked=states.length&&states.every(x=>x!==null&&x===states[0])?states[0]:null;
 let likeTarget=null;
 if(buttons.filter(visible).length===1)likeTarget='player';
 else if(kind==='detail'){
  const info=[...root.querySelectorAll('[data-e2e="detail-video-info"]')].filter(visible);
  const share=info.length===1?[...info[0].querySelectorAll('[data-e2e="video-share-icon-container"]')].filter(visible):[];
  const bar=share.length===1?share[0].parentElement:null;
  if(bar?.children.length===4&&bar.children[3]===share[0]&&visible(bar.children[0])&&bar.children[0].querySelector('svg')&&bar.children[0].querySelector('span'))likeTarget='detail-toolbar';
 }
 return {supported:true,id,kind,paused:video.paused,liked,likeTarget,title:(root.querySelector('[data-e2e="video-desc"],[data-e2e="detail-video-info"]')?.textContent||'').trim().slice(0,220)};
}
export async function inspectVideo(page,expectedId){
 const state=await page.evaluate(readVideoSurface);
 if(!state.supported||expectedId&&state.id!==expectedId)throw Object.assign(new Error(expectedId&&state.id!==expectedId?'操作过程中作品已切换，停止操作':state.reason),{code:'DOUYIN_VIDEO_UNAVAILABLE',beforeDelivery:true});
 return state;
}
export async function findVideoPage(context){
 const candidates=[];for(const page of context.pages()){
  if(page.isClosed())continue;const name=await page.evaluate(()=>window.name).catch(()=>'');
  if(!['deepseek-douyin-api','deepseek-douyin-dsh'].includes(name))continue;
  const state=await page.evaluate(readVideoSurface).catch(()=>null);if(state?.supported)candidates.push({page,state});
 }
 if(candidates.length!==1)throw Object.assign(new Error(candidates.length?'发现多个专用观看页，无法确定本轮作品':'专用观看页没有唯一可识别的视频；已检查推荐流和作品详情页'),{code:'DOUYIN_VIDEO_UNAVAILABLE',beforeDelivery:true});
 return candidates[0].page;
}
export async function likeControl(page,expectedId){
 const state=await inspectVideo(page,expectedId);if(state.liked===null||!state.likeTarget)throw Object.assign(new Error('无法核对当前作品的点赞控件或状态，未点击'),{beforeDelivery:true});
 const root=page.locator(state.kind==='detail'?'[data-e2e="video-detail"]':'[data-e2e="feed-active-video"]').filter({visible:true});
 if(await root.count()!==1)throw Object.assign(new Error('作品容器不唯一'),{beforeDelivery:true});
 let button;
 if(state.likeTarget==='player')button=root.locator('[data-e2e="video-player-digg"]').filter({visible:true});
 else{const share=root.locator('[data-e2e="detail-video-info"] [data-e2e="video-share-icon-container"]').filter({visible:true});if(await share.count()!==1)throw Object.assign(new Error('详情操作栏不唯一'),{beforeDelivery:true});button=share.locator('xpath=..').locator(':scope > div').nth(0);}
 if(await button.count()!==1||!await button.isVisible())throw Object.assign(new Error('点赞控件不可见或不唯一'),{beforeDelivery:true});
 return {button,state};
}
