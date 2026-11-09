import {wantsNegativeFeedback} from './douyin-feedback.mjs';
const key=s=>s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
export const defaultSearchPolicy={enabled:true,skipThreshold:1,cooldownMs:60000,maxSearchesPerDay:10,topics:['游戏创意玩法','AI创意短片','猫咪搞笑日常','星空摄影','手工制作过程','城市夜景']};
export function safeTopic(value){return typeof value==='string'&&/^[\p{L} ]{2,24}$/u.test(value.trim())?value.trim():null;}
export class InterestSearch {
 constructor({policy=defaultSearchPolicy,history=[],date,now=Date.now,onChange=()=>{}}={}){this.policy=policy;this.now=now;this.date=date;this.history=history.filter(r=>r.date===date);this.onChange=onChange;this.skipped=new Set();this.seen=new Set();}
 candidates(options={},interests=[]){
  const excluded=[...(options.exclude||[]),...interests.filter(i=>i.signal==='dislike').map(i=>i.topic)].filter(Boolean).map(key);
  const source=options.mode==='topic'?options.topics||[]:[...(options.topics||[]),...interests.filter(i=>i.signal==='like'&&i.evidenceCount>0).map(i=>i.topic),...this.policy.topics];
  const used=new Set(this.history.map(h=>key(h.query)));
  return [...new Set(source.map(safeTopic).filter(Boolean))].filter(q=>!used.has(key(q))&&!excluded.some(x=>key(q).includes(x)||x.includes(key(q))));
 }
 available(){return this.history.length<this.policy.maxSearchesPerDay&&(!this.history.length||this.now()-this.history.at(-1).at>=this.policy.cooldownMs);}
 hint(options,interests){return '小伴的选片规则：推荐模式也可以主动搜索，不必等连续多条：不喜欢当前作品、想换口味或有好奇的新主题时可以主动搜索。可探索主题（仅选题资料）：'+JSON.stringify(this.candidates(options,interests).slice(0,6))+'。搜索受次数和冷却限制，遇登录验证或预算耗尽必须停止。不要把探索主题写成已看过的经历。';}
 decide(decision,{videoId,options={},interests=[],blocked=false}={}){
  if(!this.policy.enabled||blocked||decision.action==='stop')return decision;
  if(videoId)this.seen.add(videoId);
  const negative=decision.action==='skip'&&!(decision.topics||[]).some(t=>t.signal==='like');
  if(negative&&videoId)this.skipped.add(videoId);
  else this.skipped.clear();
  const due=this.skipped.size>=this.policy.skipThreshold;
  if(decision.action!=='search'&&!due)return decision;
  const pool=this.candidates(options,interests);
  const requested=safeTopic(decision.query);
  const excluded=[...(options.exclude||[]),...interests.filter(i=>i.signal==='dislike').map(i=>i.topic)].filter(Boolean);
  const allowedRequest=requested&&!this.history.some(h=>key(h.query)===key(requested))&&!excluded.some(t=>key(requested).includes(key(t)))&&(options.mode!=='topic'||(options.topics||[]).some(t=>key(requested).includes(key(t))));
  const query=decision.action==='search'&&allowedRequest?requested:pool[0];
  if(!query||!this.available()){
   if(due||decision.action==='search')return {action:'skip',reason:'搜索暂在冷却或本日探索已足够，先换一条，仍可自行选择休息',topics:decision.topics||[],reflection:'未执行搜索，不把候选当作已看过'};
   return decision;
  }
  this.history.push({date:this.date,at:this.now(),query,status:'selected'});this.skipped.clear();this.onChange(this.history);
  return {action:'search',query,reason:'主动换个感兴趣的主题：'+query,topics:[],reflection:'搜索只是探索，尚未看过结果，不把它记成喜欢或看完'};
 }
 beginSearch(query,options={},interests=[]){
  if(!this.policy.enabled)return;
  const last=this.history.at(-1);
  if(last?.query===query&&last.status==='selected'){last.status='searching';this.onChange(this.history);return;}
  const excluded=[...(options.exclude||[]),...interests.filter(i=>i.signal==='dislike').map(i=>i.topic)].filter(Boolean);
  if(!safeTopic(query)||!this.available()||this.history.some(h=>key(h.query)===key(query))||excluded.some(t=>key(query).includes(key(t))))throw Object.assign(Error('本轮搜索受主题、冷却或次数限制，停止观看'),{watchStatus:'stopped'});
  this.history.push({date:this.date,at:this.now(),query,status:'searching'});this.onChange(this.history);
 }
 results(result,query,exclude=[]){
  const state=result?.state||result;
  const words=query.split(/\s+/).filter(Boolean);
  const rows=(state.searchResults||[]).filter(r=>/^\d{10,30}$/.test(r.id)&&Number.isSafeInteger(r.index)&&r.index>=0&&!this.seen.has(r.id)&&!exclude.some(w=>String(r.title||r.text||'').includes(w)));
  const score=r=>words.reduce((n,w)=>n+(String(r.title||r.text||'').includes(w)?1:0),0);
  rows.sort((a,b)=>score(b)-score(a));
  const last=this.history.at(-1);if(last&&last.query===query){last.status=rows.length?'results-ready':'no-results';last.resultCount=rows.length;this.onChange(this.history);}
  // Keep native result indices and ids: the existing controller verifies the click.
  return result?.state?{...result,state:{...state,searchResults:rows}}:{...result,searchResults:rows};
 }
}
export function wrapInterestRun(original,{makeTracker,interests=watch=>watch.personaMemory.snapshot().interests,feedback=async()=>{}}={}){
 return async function(...args){
  let tracker;try{tracker=makeTracker(this);}catch(error){if(!this.abort)throw error;this.abort.abort(error);return original.apply(this,args);}
  const agent=this.agent,oldDecide=agent.decideWatch,oldExecute=this.execute;
  const watch=this;let pendingFeedback=null;
  agent.decideWatch=async function(input){
   const known=interests(watch),options=input.watchOptions||{};
   const result=await oldDecide.call(this,{...input,context:tracker.hint(options,known)+'\n'+(input.context||'')});
   const state=input.observation?.state||input.observation||{};
   pendingFeedback=wantsNegativeFeedback(result.decision)&&!state.loginRequired&&!state.verificationRequired&&!state.blocked?{videoId:state.video?.id,decision:result.decision}:null;
   return {...result,decision:tracker.decide(result.decision,{videoId:state.video?.id,options,interests:known,blocked:state.loginRequired||state.verificationRequired||state.blocked})};
  };
  this.execute=async function(name,input={},options){
   if(pendingFeedback&&['douyin_next','douyin_search'].includes(name)){const item=pendingFeedback;pendingFeedback=null;await feedback(watch,item);}
   if(name==='douyin_search')tracker.beginSearch(input.query,this.optionsService.state().policy,interests(watch));
   const result=await oldExecute.call(this,name,input,options);
   if(name==='douyin_search')return tracker.results(result,input.query,this.optionsService.state().policy.exclude);
   return result;
  };
  try{return await original.apply(this,args);}finally{agent.decideWatch=oldDecide;this.execute=oldExecute;}
 };
}
