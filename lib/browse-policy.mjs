import {platformHold} from './platform-holds.mjs';
import fs from 'node:fs';import path from 'node:path';import {workspace,day} from './runtime.mjs';
export const BROWSE_PLATFORMS=['douyin','xiaohongshu','zhihu','none'];
export function browseSelection(platform,{root=workspace,date=day(),now=Date.now()}={}){
 const hold=platformHold(platform,{root});if(hold)return {allowed:false,reason:hold.reason};
 const file=path.join(root,'.state/social-plan.json');
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
 const plan=state.plan;
 if(state.date!==date||state.status!=='ready'||plan?.policyVersion!==2)return {allowed:false,reason:'今日自主浏览计划尚未就绪'};
 if(plan.browsePlatform!==platform)return {allowed:false,reason:plan.browsePlatform==='none'?'今天自主选择不刷推荐流':'今天自主浏览选择了 '+plan.browsePlatform};
 const minute=new Date(now+8*3600000).getUTCHours()*60+new Date(now+8*3600000).getUTCMinutes();
 if(minute<480||minute<plan.browseMinute)return {allowed:false,reason:'尚未到自主选择的浏览时间'};
 return {allowed:true,platform};
}
export function assertBrowseSelection(platform,options){const result=browseSelection(platform,options);if(!result.allowed)throw Object.assign(new Error(result.reason),{code:'BROWSE_NOT_SELECTED',beforeDelivery:true});}
