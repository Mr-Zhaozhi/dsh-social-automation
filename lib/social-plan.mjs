export function localClock(now=Date.now()){
 const d=new Date(now+8*3600000);return {date:d.toISOString().slice(0,10),minute:d.getUTCHours()*60+d.getUTCMinutes()};
}
export function validatePlan(plan,now=Date.now()){
 const {date,minute}=localClock(now),minimum=minute+5;
 if(!plan||!['douyin','xiaohongshu','zhihu','none'].includes(plan.browsePlatform))throw new Error('每天仅选择一个浏览平台，也可以不刷');
 const selected=plan.browsePlatform;
 if(selected!=='none'&&(!Number.isInteger(plan.browseMinute)||plan.browseMinute<Math.max(480,minimum)||plan.browseMinute>1439))throw new Error('浏览时间须在今天未来且不在安静时段');
 const input=plan.douyinWindows||[];
 if(!Array.isArray(input)||input.length>(selected==='douyin'?3:0)||selected==='douyin'&&input.length<1)throw new Error('仅选择抖音时设置1至3个观看时段');
 const windows=input.map(w=>{
  if(!Array.isArray(w)||w.length!==2||!w.every(Number.isInteger)||w[0]<Math.max(480,minimum)||w[1]>1439||w[1]<=w[0])throw new Error('观看时段必须在今天未来且不跨日');return w;
 }).sort((a,b)=>a[0]-b[0]);
 if(windows.some((w,i)=>i&&w[0]<windows[i-1][1])||windows.reduce((s,w)=>s+w[1]-w[0],0)>30)throw new Error('观看时段重叠或超过全天共享30分钟');
 if(selected==='douyin'&&plan.browseMinute!==windows[0][0])throw new Error('浏览开始时间与抖音第一段不一致');
 if(plan.publishMinute!==null&&(!Number.isInteger(plan.publishMinute)||plan.publishMinute<minimum||plan.publishMinute>1439))throw new Error('发布时间必须在今天未来或选择不发布');
 return {policyVersion:2,date,browsePlatform:selected,browseMinute:selected==='none'?null:plan.browseMinute,douyinWindows:windows,publishMinute:plan.publishMinute,reason:String(plan.reason||'').slice(0,200)};
}
export const clockText=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export const atMinute=(date,minute)=>new Date(date+'T'+clockText(minute)+':00+08:00').toISOString();
export function constrainPlan(plan){
 if(!Array.isArray(plan?.douyinWindows)||plan.douyinWindows.some(w=>!Array.isArray(w)||w.length!==2||!w.every(Number.isInteger)))return plan;
 const merged=[];for(const [start,end] of [...plan.douyinWindows].sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&start<last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);}
 let remaining=30;const windows=[];for(const [start,end] of merged){if(remaining<=0)break;const duration=Math.min(remaining,end-start);windows.push([start,start+duration]);remaining-=duration;}
 return {...plan,douyinWindows:windows};
}
