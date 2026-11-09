import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {harness,workspace,atomicJSON,day} from '../lib/runtime.mjs';
import {InterestSearch,wrapInterestRun,defaultSearchPolicy} from '../lib/interest-search.mjs?v=3';
import {negativeFeedback,canFeedback} from '../lib/douyin-feedback.mjs';
import {assertBackgroundUse} from '../lib/browser-pages.mjs';
import {assertRunner} from '../lib/fleet.mjs';
import {assertPlatformAvailable} from '../lib/platform-holds.mjs';
export const name='huohuo-interest-search';
export async function apply(ctx){
 const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
 const core=fs.readFileSync(path.join(pkg,'core.mjs'),'utf8');
 const suffixes=new Set(['',...[...core.matchAll(/autonomous-watch\.mjs(\?v=\d+)/g)].map(m=>m[1])]);
 const classes=new Set();for(const suffix of suffixes)classes.add((await import(pathToFileURL(path.join(pkg,'autonomous-watch.mjs')).href+suffix)).AutonomousWatch);
 const file=path.join(workspace,'.state/interest-search.json');
 const feedbackFile=path.join(workspace,'.state/douyin-negative-feedback.json');
 const feedback=async(watch,{videoId})=>{
  const rows=fs.existsSync(feedbackFile)?JSON.parse(fs.readFileSync(feedbackFile)).entries:[];
  if(!canFeedback(rows,videoId,{date:day()}))return;
  const authorize=async()=>{watch.abort.signal.throwIfAborted();watch.assertAllowed();assertPlatformAvailable('douyin');await assertBackgroundUse();await assertRunner();watch.assertAllowed();};
  const record=value=>{let row=rows.find(r=>r.videoId===videoId);if(!row){row={videoId,date:day(),at:Date.now()};rows.push(row);}Object.assign(row,value,{updatedAt:new Date().toISOString()});atomicJSON(feedbackFile,{version:1,entries:rows});};
  const signal=AbortSignal.any([watch.abort.signal,AbortSignal.timeout(15000)]);
  const outcome=await watch.controller.withPage(page=>negativeFeedback(page,videoId,{authorize,record}),{signal,launch:false,create:false,authorizePrepare:authorize});
  watch.onEvent({type:'watch.negative-feedback',...outcome});
  if(outcome.status==='unknown')throw Object.assign(Error('不感兴趣反馈结果待确认，保留记录，不重复点击'),{watchStatus:'needs_user'});
 };
 ctx.effect(()=>{
  const saved=[];
  for(const type of classes){
   const old=type.prototype.run;
   if(String(old).includes('makeTracker(this)'))throw Error('旧兴趣搜索插件尚未卸载，未叠加安装');
   const wrapped=wrapInterestRun(old,{feedback,makeTracker:()=>{const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};return new InterestSearch({policy:defaultSearchPolicy,date:day(),history:state.history||[],onChange:history=>atomicJSON(file,{version:1,history,updatedAt:new Date().toISOString()})});}});
   type.prototype.run=wrapped;saved.push([type,old,wrapped]);
  }
  atomicJSON(path.join(workspace,'.state/interest-search-plugin.json'),{loaded:true,implementation:3,at:new Date().toISOString(),variants:[...suffixes],policy:defaultSearchPolicy,negativeFeedback:'explicit-dislike-visible-control-only'});
  return()=>{for(const[type,old,wrapped]of saved)if(type.prototype.run===wrapped)type.prototype.run=old;};
 });
}
