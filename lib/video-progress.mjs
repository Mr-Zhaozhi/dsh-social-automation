// Bound repeated observation of one looping clip without bypassing watch limits.
export class VideoProgress {
 constructor({maxObservations=4,maxMs=90000}={}){this.maxObservations=maxObservations;this.maxMs=maxMs;}
 observe(id,now=Date.now()){
  if(!id)return false;
  if(this.id!==id){this.id=id;this.since=now;this.count=0;}
  return ++this.count>this.maxObservations||now-this.since>=this.maxMs;
 }
}
export async function advanceVideo(execute,expectedId){
 const result=await execute('douyin_next',{}, {expectedVideoId:expectedId});
 const state=result?.state||result;
 if((result?.changed===true||result?.staleObservation===true)&&state.video?.id&&state.video.id!==expectedId&&state.video.readyState>=2)return result;
 throw new Error('未确认切换到新作品，停止本轮，避免重复观看或互动');
}
