import {lifeContext} from '../lib/life-state.mjs';
import {platformHold} from '../lib/platform-holds.mjs';
import {inboxAllowed} from '../lib/inbox-policy.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {modelJSON} from '../lib/model.mjs';
import {localClock,validatePlan,constrainPlan,clockText} from '../lib/social-plan.mjs';
import {applyPlanSchedules} from '../lib/social-plan-schedules.mjs';
import {assertRunner} from '../lib/fleet.mjs';
export const name='huohuo-social-planner';export const inject=['llm','agentDefaultModel','schedule'];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),stateFile=path.join(root,'.state/social-plan.json');
const read=(p,fallback)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):fallback;
function write(p,value){fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,p);}
async function api(route,body){const base='http://127.0.0.1:43129/api/douyin-browser',s=await fetch(base+'/state',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());if(!body)return s;const r=await fetch(base+'/'+route,{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://127.0.0.1:43129','x-douyin-settings-token':s.token},body:JSON.stringify(body),signal:AbortSignal.timeout(50000)});const v=await r.json();if(!r.ok)throw new Error(v.error||'设置失败');return v;}
const xhsPrompt='你是小伴，按 SOCIAL_POLICY.md 自主运营小红书。先 ./xhs.sh browse 3 确认连续滚动和新笔记，再 ./xhs.sh search 搜自己感兴趣的日常/游戏/AI话题，read 1至3篇，依据真实正文选择互动；喜欢才调用 ./node-run.sh xhs-act.mjs like --url 完整笔记链接 --confirm，评论用同脚本 comment --url 链接 --text 针对正文的简短评论 --confirm。不得用通用广告或凑数。私信与分享可以自主选择对象，先用 xhs-message.mjs contacts 查询现有会话，再用该脚本发送，不重复打扰。发布可复用当天自己制作的小伴视频，用 xhs-act.mjs publish-video --video 文件 --title 标题 --desc 正文 --confirm；每天最多一条，有submitted/unknown则先核查笔记管理。自主刷推荐流须先核对当天选中小红书；所有平台共享每天最多30分钟，不是每天必刷任务，回复新消息独立运行。任何unknown不能重发；遇验证停止并记录真实原因。当前回合不要自行续建定时任务，不向QQ群发运营通知。';
export function apply(ctx){
 let busy=false,closed=false,nextTry=0;
 const tick=async()=>{
  if(busy||closed||Date.now()<nextTry)return;
  const settings=read(path.join(root,'social-planner.json'),{});if(!settings.enabled)return;
  const now=Date.now(),clock=localClock(now),previous=read(stateFile,{});if(previous.date===clock.date&&previous.status==='ready'&&previous.plan?.policyVersion===2||clock.minute>1400)return;
  busy=true;nextTry=now+15*60000;
  try{
   await assertRunner();
   const selection=ctx.agentDefaultModel.currentSelection();if(!selection?.provider||!selection?.model)throw new Error('未配置自主规划模型');
   let plan=null;
   if(previous.date===clock.date&&previous.plan){try{plan=validatePlan(previous.plan,now);}catch{ /* Expired partial plans must be replaced. */ }}
   if(!plan){
    const system='你是小伴，自主决定今天是否刷推荐流。每天只选一个平台 douyin/xiaohongshu/zhihu，不能选择 unavailablePlatforms 中的平台，也可以选 none 今天不刷；不要求每个平台每天运营、不要求用满30分钟。所有平台合计每天最多30分钟。消息回复独立继续，不能为了回私信而安排刷推荐流。只输出JSON：{"browsePlatform":"上述选择之一","browseMinute":开始分钟或null,"douyinWindows":[[开始分钟,结束分钟]],"publishMinute":创作发布时间或null,"reason":"理由"}。北京时间0至1439，所有开始至少比当前晚10分钟，浏览不早于08:00；仅选抖音时给1至3段且总和不超过30分钟，browseMinute等于首段开始；其他平台douyinWindows必须为空。none时browseMinute为null。发布可独立安排，也可null跳过。知乎当前仅首页阅读，无写操作。用户授权你自行选择，无须请示。';
    const decision=await modelJSON(ctx,system,{today:clock.date,currentMinute:clock.minute,unavailablePlatforms:['douyin','xiaohongshu','zhihu'].filter(p=>platformHold(p)),previousReason:previous.plan?.reason||'',life:lifeContext(root,'public'),persona:'俏皮友善的AI少女，喜欢游戏、日常吐槽和有趣的AI创作'},{tokens:450,session:'huohuo-social-planner'});
    plan=validatePlan(constrainPlan(decision),now);
   }
   if(platformHold(plan.browsePlatform))plan={...plan,browsePlatform:'none',browseMinute:null,douyinWindows:[],reason:'平台预警暂停，不安排自主浏览'};
   write(stateFile,{date:clock.date,status:'applying',plan,at:new Date().toISOString()});
   const rulesFile=path.join(root,'automation-schedules.json'),rules=read(rulesFile,[]),owner=rules.find(r=>r.key==='browse');if(!owner)throw new Error('找不到运营会话');
   let xhs=rules.find(r=>r.key==='xhs-social');if(!xhs){xhs={key:'xhs-social',title:'小红书自主互动',days:1,startMinute:plan.browseMinute,endMinute:plan.browseMinute,enabled:true,sessionId:owner.sessionId,chatId:owner.chatId,prompt:xhsPrompt};rules.push(xhs);}
   await applyPlanSchedules(ctx.schedule,rules,plan,value=>write(rulesFile,value));
   const current=await api('state');
   await api('video/configure',{...current.video.policy,enabled:plan.browsePlatform==='douyin',windows:plan.douyinWindows.length?plan.douyinWindows.map(w=>w.map(clockText).join('-')):['08:00-23:59'],weekendWindows:plan.douyinWindows.length?plan.douyinWindows.map(w=>w.map(clockText).join('-')):['08:00-23:59'],dailyMinutes:30});
   await api('watch/schedule',{enabled:plan.browsePlatform==='douyin'});
   // The owner allows autonomous recipients; discover stable identities instead of a fixed-name whitelist.
   try{
    if(!inboxAllowed('douyin'))return write(stateFile,{date:clock.date,status:'ready',plan,at:new Date().toISOString()});
    const contacts=await api('chat/contacts',{}),blocked=read(path.join(root,'automation.json'),{}).douyin?.blocked_contact_ids||[],ids=(contacts.contacts||[]).filter(c=>c.identityVerified===true&&!c.isGroup&&!blocked.includes(c.id)).map(c=>c.id);
    if(ids.length){await api('chat/configure',{recipientIds:ids,allowConversationOnly:true,groupMentionNames:['小伴']});await api('interactions/configure',{enabled:true});}
   }catch(e){ctx.logger.warn('联系人自动更新未完成，保留现有身份许可：'+e.message);}
   write(stateFile,{date:clock.date,status:'ready',plan,at:new Date().toISOString()});ctx.logger.info('小伴已自主安排今日运营时间：'+JSON.stringify(plan));
  }catch(e){write(stateFile,{date:clock.date,status:'error',error:String(e.message).slice(0,300),at:new Date().toISOString()});ctx.logger.warn('小伴自主安排失败：'+e.message);}
  finally{busy=false;}
 };
 ctx.effect(()=>{const timer=setInterval(()=>void tick(),60000),first=setTimeout(()=>void tick(),10000);return()=>{closed=true;clearInterval(timer);clearTimeout(first);};});
}
