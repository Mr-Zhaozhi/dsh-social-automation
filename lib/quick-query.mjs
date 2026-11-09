import fs from 'node:fs';
import path from 'node:path';
import {workspace,isMainModule} from './runtime.mjs';
import {inboxStatus} from './inbox-policy.mjs';
import {eligibility,settingsFor} from './companion-policy.mjs';

// Fixed, bounded regular-file reads. Never traverse logs, archives or devices.
export function readSmall(root,relative){
 const file=path.join(root,relative);let fd;
 try{fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);const s=fs.fstatSync(fd);if(!s.isFile()||s.size>512*1024)throw Error('invalid-size');return JSON.parse(fs.readFileSync(fd,'utf8'));}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
export function quickKind(input){
 const raw=String(input||'').trim();
 if(raw.length>180||/[\n\r“”"'<>\[\]；;]/.test(raw))return null;
 const t=raw.replace(/^小伴[，,\s]*/,'').replace(/[。！？!?]+$/,'');
 if(/^(?:查看|看看|查询)?(?:快速查询|快捷查询|快捷帮助)$/.test(t))return 'help';
 if(/^(?:你)?(?:现在|目前)?(?:有|能用|支持|有哪些|有什么)(?:哪些|什么)?(?:音色|声音)(?:可以用|可用|吗)?$/.test(t)||/^(?:查看音色|音色列表|主音色是什么|默认(?:音色|声音)是什么|你现在用的是什么声音)$/.test(t))return 'voices';
 if(/^(?:查看|看看|查询)?(?:浏览器状态|网页能力|联网能力|爬虫能力)$/.test(t)||/^你(?:能|会|可以)(?:不能)?(?:上网|浏览网页|逛网页|爬网页|爬虫|搜索网页)(?:吗)?$/.test(t))return 'web';
 if(/^(?:查看|看看|查询)(?:全部设置|运行状态|健康状态)$/.test(t))return 'status';
 if(/^(?:你)?(?:现在|目前)?(?:什么时间|什么时候|几点)(?:会|开始|主动)?检查(?:新消息|新互动|消息)?$/.test(t)||/^(?:为什么|怎么)(?:不|没有)检查(?:消息|新消息|新互动)$/.test(t))return 'inbox';
 if(/^(?:你)?(?:怎么|为什么)(?:都|一直)?(?:不|没有)(?:主动)?找我(?:聊天|闲聊)?$/.test(t)||/^(?:查看|看看|查询)主动聊天状态$/.test(t))return 'companion';
 if(/^(?:查看|看看|查询)(?:共享记忆状态|共享上下文状态)$/.test(t)||/^(?:你们的|你的)?(?:记忆|上下文)(?:是|是不是)?(?:共用|共享|互通|统一)(?:的)?(?:吗)?$/.test(t))return 'memory';
 if(/^(?:怎么|如何)(?:新增|开启|添加|授权)(?:一个)?(?:主动群|新群|群聊)$/.test(t)||/^(?:新群(?:需要|是不是需要)(?:授权|开通)|为什么新群不回复|新群为什么不回复|在新群叫你怎么没反应)$/.test(t))return 'groups';
 if(/^我在一个新群里叫你去聊天[，,]你没反应[，,]是不是需要给你接入新授权群$/.test(t))return 'groups';
 return null;
}
export function verifiedOwner(platform,peer,root=workspace){
 if(!peer)return false;
 try{if(platform==='qq')return String(readSmall(root,'automation.json').owner_qq)===String(peer);
 if(platform==='wechat')return (readSmall(root,'.state/shared-context/bindings.json').owners?.wechat||[]).includes(String(peer));}catch{}
 return false;
}
const names={self:'小伴本声',jinx:'配置的固定音色',lively:'活力小女生',cantonese:'粤语女声',beijing:'于谦北京话男声',zed:'劫'};
const reasons={'platform-warning':'因平台预警暂停','paused':'手动暂停','paused-until':'临时暂停','quiet-hours':'休息时段','active':'时段允许检查','invalid-policy':'设置异常，已暂停'};
const proReasons={'disabled':'主动聊天已关闭','model-backoff':'模型失败后正在退避','quiet-hours':'正在休息','delivery-needs-review':'上一条发送结果待核对','daily-cap':'达到今日主动消息上限','waiting-owner':'已主动发过消息，正在等你回应','recent-chat':'刚聊过，等你空闲些','just-replied':'刚回复完','cooldown':'距上次主动消息还太近','next-check':'等待下一次评估'};
const fresh=(at,now,age)=>Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=-60000&&now-Date.parse(at)<age;
function inbox(root,now){
 // Fail explicitly on missing/corrupt policy rather than reporting defaults as actual settings.
 readSmall(root,'inbox-policy.json');readSmall(root,'platform-holds.json');
 return [['douyin','抖音'],['xiaohongshu','小红书'],['zhihu','知乎']].map(([p,n])=>{const s=inboxStatus(p,{root,now});return `${n}：${s.start||'未知'}–${s.end||'未知'}，${reasons[s.reason]||'状态未知'}`;}).join('；')+'（北京时间）。时段允许不代表浏览器已连通。QQ、微信入站回复不受此时段限制。';
}
function web(root,now){
 let probe;try{probe=readSmall(root,'.state/web-capabilities.json');}catch{}
 const valid=probe&&fresh(probe.checkedAt,now,86400000);
 const lines=['网页正文读取：'+(valid?(probe.fetch?.ok?'已实测可用':'最近实测未通过'):'尚无24小时内实测记录'),'网页搜索：'+(valid?(probe.search?.ok?'已实测可用':probe.search?.ready===false?'搜索凭据未就绪':'最近未验证成功'):'待实测')];
 let health;try{health=readSmall(root,'.state/health.json');}catch{}
 const browser=health&&fresh(health.checkedAt,now,900000)?health.checks?.browser:null;
 lines.push('浏览器控制：'+(browser?.control_ready===false?'未就绪，保留的发布页未关闭':browser?.control_ready===true?'控制就绪，具体页面仍需按权限验证':'状态待核对'));
 lines.push('网页读取不执行页面脚本；动态翻页和登录页面需要浏览器。现有能力不是无限递归爬站，平台预警和登录限制仍然有效。');
 return lines.join('。');
}
export function quickReply(kind,{root=workspace,now=Date.now()}={}){
 try{
  if(kind==='help')return '朋友，直接问这些就能快速查：怎么新增主动群、有哪些音色、什么时候检查新消息、为什么不主动找我聊天、查看共享记忆状态、查看网页能力、查看运行状态。修改设置仍可说“设置帮助”。';
  if(kind==='groups'){const groups=Object.values(readSmall(root,'automation.json').qq_groups||{}).filter(g=>g.enabled===true).map(g=>g.name||'未命名群');return `新群需要单独开启免艾特接话。先把我拉进群，再在主人私聊发“新增主动群 群号”，也支持唯一群名；没开启时请艾特我。当前开启：${groups.join('、')||'暂无'}。这次只是查询，没有改权限。`;}
  if(kind==='voices'){const v=readSmall(root,'automation.json').voice;return `主音色：${names[v.primary_profile]||'未识别'}；可用：${Object.keys(v.profiles||{}).map(k=>names[k]||k).join('、')}。抖音视频固定本声；其他平台自动语音本声与配置的固定音色各50%，点名音色优先。可以直接说“用北京话说句晚上好”。`;}
  if(kind==='inbox')return inbox(root,now);
  if(kind==='companion'){const p=readSmall(root,'interaction-policy.json'),state=readSmall(root,'.state/companion.json');const e=eligibility(state,p,now,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now));return `主动程度${p.level}，休息时间${p.quietStart}:00–${p.quietEnd}:00（北京时间）。当前：${e.due?'满足初步条件，仍由调度器判断是否有合适话题':proReasons[e.reason]||'待核对'}。每日最多${settingsFor(p.level).maxPerDay}次，不会为了用满次数硬聊。可说“主动程度调到80”或“主动聊天时间改成每天10:00到23:00”。`;}
  if(kind==='memory'){const h=readSmall(root,'.state/shared-context/health.json');const rows=['qq','wechat'].map(p=>{try{const r=readSmall(root,`.state/shared-context/last-injection-${p}.json`);return `${p==='qq'?'QQ':'微信'}最近一次注入：${r.at||'未知'}`;}catch{return `${p==='qq'?'QQ':'微信'}暂无注入记录`;}});return `共享上下文插件有启动记录（${h.startedAt||'时间未知'}）。${rows.join('；')}。这是记录核对，不代表所有历史都进了每轮上下文；按已绑定身份共享，群聊不公开私聊记忆。`;}
  if(kind==='web')return web(root,now);
  if(kind==='status'){const h=readSmall(root,'.state/health.json');return `最近体检：${h.checkedAt||'未知'}${fresh(h.checkedAt,now,900000)?'':'（记录已过期，不能当实时结果）'}。QQ连接：${h.checks?.qq?.ok?'该次正常':'该次异常或未知'}。\n${web(root,now)}\n${inbox(root,now)}`;}
 }catch{return '朋友，这项设置或状态文件暂时读不到/格式异常，我不能把默认值当成实际状态。没有修改设置，也不会继续扫描整个目录；需要维护检查这一项。';}
 return null;
}
if(isMainModule(import.meta.url)){const kind=quickKind(process.argv.slice(2).join(' '));console.log(kind?quickReply(kind):'未匹配快捷查询；发“快速查询”查看支持的问法。');}
