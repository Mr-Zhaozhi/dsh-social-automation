import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return {};}};
// Read existing receipts only. This never starts a browser, polls a social API,
// creates an LLM request, or upgrades a plan/observation into a completed action.
export function activitySnapshots(root,home){
 const rows=[];const add=(platform,id,at,text,status)=>{if(at&&text)rows.push({platform,id,at,text,status,role:'activity'});};
 const xhs=read(path.join(root,'.state/xhs-browse.json'));
 if(xhs.at)add('xiaohongshu','feed:'+xhs.at,xhs.at,'小红书推荐流里看到的标题（仅列表浏览，不代表读完正文）：'+(xhs.frames||[]).flatMap(f=>f.cards||[]).map(c=>c.title).filter(Boolean).slice(-8).join('；'),'observed-feed');
 const zh=read(path.join(root,'.state/zhihu-browse.json'));
 if(zh.at)add('zhihu','feed:'+zh.at,zh.at,'知乎首页看到的标题（未进入详情）：'+(zh.items||[]).slice(-8).map(c=>c.title).filter(Boolean).join('；'),'observed-feed');
 const plan=read(path.join(root,'.state/social-plan.json'));
 if(plan.status==='ready'&&plan.at)add('activity','plan:'+plan.at,plan.at,'当天自主浏览计划：'+JSON.stringify({date:plan.date,platform:plan.plan?.browsePlatform,minute:plan.plan?.browseMinute,reason:plan.plan?.reason})+'。这是计划，不证明已执行。','planned');
 const file=path.join(home,'.dsh/douyin-browser/memory/shared.sqlite');let db;
 if(fs.existsSync(file))try{
  db=new DatabaseSync(file,{readOnly:true});
  for(const r of db.prepare("SELECT id,content,metadata_json,updated_at,status FROM memory_entries WHERE origin='video' AND kind='video' ORDER BY updated_at DESC LIMIT 8").all()){
   let meta;try{meta=JSON.parse(r.metadata_json||'{}');}catch{continue;}
   if(meta.sourceType==='private'||meta.privacy==='internal-reference'||String(meta.visibility||'').startsWith('private'))continue;
   add('douyin','video:'+r.id+':'+r.updated_at,r.updated_at,'抖音已有视频观察记录（不代表完整看完）：'+r.content,r.status||'observed-video');
  }
 }catch{}finally{db?.close();}
 return rows;
}
