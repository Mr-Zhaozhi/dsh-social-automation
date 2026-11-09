import {assertBackgroundUse} from './browser-pages.mjs';
export async function assertBrowserAvailable(){
 await assertBackgroundUse();
 const response=await fetch('http://127.0.0.1:43129/api/douyin-browser/state',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('无法确认抖音浏览器任务状态');const state=await response.json();
 if(state.watch?.running||state.watch?.state?.running||state.autonomous?.running)throw Object.assign(new Error('抖音正在自主观看，本次其他网页操作延后，避免打断播放'),{code:'BROWSER_WATCH_BUSY',beforeDelivery:true});
}
