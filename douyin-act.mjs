#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {workspace,config,browser,sleep,atomicJSON,day,lock} from './lib/runtime.mjs';
import {verifiedClick,validCount} from './lib/browser-actions.mjs';
import {backgroundPage,assertBackgroundUse} from './lib/browser-pages.mjs';
import {verifyVideo} from './lib/video-quality.mjs';
import {assertRunner} from './lib/fleet.mjs';
import {socialBudget} from './lib/social-budget.mjs';
import {findVideoPage,inspectVideo,likeControl} from './lib/douyin-surface.mjs';
import {douyinAPI} from './lib/douyin-api.mjs';
import {nativeVideoSession} from './lib/native-video.mjs';
const args=process.argv.slice(2),cmd=args[0];
const opt=name=>{const i=args.indexOf('--'+name);return i<0?'':args[i+1]||'';};
const flag=name=>args.includes('--'+name);
const statePath=path.join(workspace,'.state/douyin-actions.json');
const log=s=>{fs.mkdirSync(path.join(workspace,'.state'),{recursive:true});fs.appendFileSync(path.join(workspace,'.state/douyin-actions.log'),new Date().toISOString()+' '+s+'\n');console.log(s);};
const read=()=>fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{actions:[]};
const record=(id,status,extra={})=>{const s=read();let a=s.actions.find(a=>a.id===id);if(!a){a={id,day:day()};s.actions.push(a);}Object.assign(a,{status,...extra});atomicJSON(statePath,s);};
const quota=kind=>read().actions.filter(a=>a.day===day()&&a.kind===kind&&a.status!=='failed').length;
const feedPage=findVideoPage;
async function videoKey(page){return (await inspectVideo(page)).id;}
async function next(page,before,session){
 const service=await douyinAPI();
 if(service.watch?.running){
  const end=Date.now()+70000;
  while(Date.now()<end){await sleep(1500);if(await videoKey(page)!==before)return;}
  throw new Error('自主观看没有切换新作品，本轮停止');
 }
 await (await session()).next(before);
 if(await videoKey(page)===before)throw new Error('下一条未切换成功');
}
async function act(ctx,kind,count){
  const page=await feedPage(ctx);let completed=0,native;const session=async()=>native??=await nativeVideoSession();
  try{
  for(let i=0;i<count;i++){
    const key=await videoKey(page);if(!key)throw new Error('无法识别当前作品，停止操作');
    const id=crypto.createHash('sha256').update(kind+key).digest('hex');
    const limit=config.douyin[kind==='like'?'daily_likes':'daily_follows'];
    if(limit!==null&&quota(kind)>=limit)throw new Error('已达到今日操作限额');
    const old=read().actions.find(a=>a.id===id);
    if(old){
      if(kind==='like'&&['pending','unknown'].includes(old.status)&&(await inspectVideo(page,key)).liked===true){record(id,'confirmed',{verifiedAt:new Date().toISOString(),reconciled:true});log('like: 已回读确认此前点赞成功，没有再次点击');}
      else log(kind+': 此作品已有操作记录（'+old.status+'），跳过');
    }
    else{
      const surface=await inspectVideo(page,key);
      const button=kind==='like'?(await likeControl(page,key)).button:page.locator('[data-e2e="feed-active-video"] [data-e2e="feed-follow-icon"]').filter({visible:true});
      if(kind==='follow'&&surface.kind!=='feed'||await button.count()!==1)throw new Error('当前页面没有唯一可核对的操作按钮');
      const on=async()=>{const current=await inspectVideo(page,key);if(kind==='like'){if(current.liked===null)throw new Error('点赞状态无法核对');return current.liked;}return button.evaluate(el=>/已关注|互相关注/.test((el.textContent||'')+(el.getAttribute('aria-label')||'')));};
      if(!await on())await button.click({trial:true,timeout:5000});
      await assertRunner();await inspectVideo(page,key);
      record(id,'pending',{kind,video:key});
      try{const changed=await verifiedClick(button,on);record(id,changed?'confirmed':'already',{kind});if(changed)completed++;log(kind+': '+(changed?'已验证成功':'原本已完成'));}
      catch(e){record(id,'unknown',{kind});throw e;}
    }
    if(i+1<count){await next(page,key,session);await sleep(8000+Math.random()*7000);}
  }
  log(kind+': 本轮验证成功 '+completed+' 个');
  }finally{await native?.close();}
}
async function publish(ctx,kind){
  await assertBackgroundUse();
  const files=(kind==='images'?opt('images').split(','):[opt('video')]).filter(Boolean).map(p=>path.resolve(p));
  const title=opt('title'),desc=opt('desc');
  if(!files.length||files.some(p=>!fs.existsSync(p)))throw new Error('素材缺失');
  if(!title||[...title].length>20)throw new Error('标题须为 1–20 字');
  const digest=crypto.createHash('sha256').update(JSON.stringify({title,desc,files:files.map(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))})).digest('hex');
  if(flag('go')&&(read().actions.some(a=>a.id===digest)||quota('post')>=config.douyin.daily_posts))throw new Error('已发布/结果待确认或达到每日发布上限，请先查创作中心');
  if(kind==='video')verifyVideo(files[0],{title,description:desc,requiredVoiceId:config.voice.profiles?.self?.id||''});
  const label='huohuo-publish:'+digest;let page;
  for(const candidate of ctx.pages())if(candidate.url().startsWith('https://creator.douyin.com/')&&await candidate.evaluate(()=>window.name)===label){page=candidate;break;}
  const existing=Boolean(page);
  if(!page){
    page=await backgroundPage(ctx);
    await page.goto('https://creator.douyin.com/creator-micro/content/upload',{waitUntil:'domcontentloaded',timeout:45000});
    if(kind==='images')await page.getByText('发布图文',{exact:true}).first().click({timeout:15000});
    const input=page.locator(kind==='images'?'input[type="file"][accept*="image"]':'input[type="file"]').first();
    await input.setInputFiles(files,{timeout:30000});
  }
  const titleBox=page.locator('input[placeholder*="标题"]').first();
  await titleBox.waitFor({state:'visible',timeout:90000});
  if(existing&&await titleBox.inputValue()!==title)throw new Error('已有草稿标题变化，请人工核对');
  if(!existing){await titleBox.fill(title);if(desc)await page.locator('div[contenteditable="true"]').last().fill(desc,{timeout:15000});await page.evaluate(label=>{window.name=label;},label);}
  if(desc&&(await page.locator('div[contenteditable="true"]').last().innerText()).replace(/[\u200B-\u200F\uFEFF]/g,'').trim()!==desc.trim())throw new Error('草稿正文与本次素材不一致，未发布');
  if(await page.getByText('请选择自主声明',{exact:true}).count()){
    await page.getByText('请选择自主声明',{exact:true}).click();
    await page.locator('label.semi-radio').filter({hasText:'内容由AI生成'}).click();
    await page.getByRole('button',{name:'确定',exact:true}).click();
  }
  if(!await page.getByText('内容由AI生成',{exact:true}).count())throw new Error('AI内容声明尚未确认，保留草稿');
  if(kind==='video'&&await page.getByText('选择封面',{exact:true}).count()){
    await page.getByText('选择封面',{exact:true}).first().click();
    await page.getByText('设置横封面',{exact:true}).last().click();
    await page.getByRole('button',{name:'完成',exact:true}).click({timeout:20000});
  }
  const button=page.getByRole('button',{name:'发布',exact:true}).last();
  await button.waitFor({state:'visible',timeout:90000});
  if(!flag('go')){log('草稿已填写并保留。核对后使用同一组参数加 --go，可继续发布本草稿。');return;}
  if(await page.getByText(/^(上传中|正在上传|转码中)([.。…\s\d%]*)$/).count())throw new Error('素材尚未就绪，保留草稿，未点发布');
  await socialBudget.run('douyin','post',digest,async()=>{
    await assertBackgroundUse();
    record(digest,'pending',{kind:'post',title});
    try{
      await button.click({timeout:15000});
      await Promise.any([page.getByText('发布成功',{exact:false}).first().waitFor({state:'visible',timeout:25000}),page.waitForURL(/\/content\/manage/,{timeout:25000})]);
      record(digest,'submitted',{kind:'post',title,at:new Date().toISOString(),page:page.url()});log('作品已提交发布，请在内容管理核对审核/公开状态');await page.close().catch(()=>{});return {confirmed:true};
    }catch(e){record(digest,'unknown',{kind:'post',title});throw new Error('发布结果待确认，保留页面；请检查创作中心，禁止自动重发');}
  },read().actions.filter(a=>a.kind==='post'&&a.status!=='failed'));
}
if(cmd==='quota'){console.log(JSON.stringify({date:day(),likes:quota('like'),posts:quota('post'),postLimit:config.douyin.daily_posts}));process.exit(0);}
if(!['like','follow','publish-images','publish-video','status'].includes(cmd)||flag('help')){console.log('用法: like [n] | follow [n] --confirm | status | quota | publish-images --title .. --desc .. --images a,b [--go] | publish-video --title .. --video file [--go]');process.exit(cmd?0:1);}
let b,release;
try{
  if(cmd==='follow'&&!flag('confirm'))throw new Error('关注需要明确 --confirm');
  // Reject stale drafts and altered captions before connecting to the browser.
  if(cmd==='publish-video')verifyVideo(path.resolve(opt('video')),{title:opt('title'),description:opt('desc'),requiredVoiceId:config.voice.profiles?.self?.id||''});
  if(cmd!=='status')await assertRunner();
  release=lock('browser-actions');b=await browser();const ctx=b.contexts()[0];
  if(cmd==='status'){const p=await feedPage(ctx),service=await douyinAPI();console.log(JSON.stringify({connected:true,...await inspectVideo(p),watch:{running:service.watch?.running,status:service.watch?.status,remainingModelRequests:service.video?.daily?.remainingRequests},today:{likes:quota('like'),posts:quota('post')}}));}
  else if(cmd==='like'||cmd==='follow')await act(ctx,cmd,validCount(args[1],cmd==='like'?15:3));
  else await publish(ctx,cmd==='publish-images'?'images':'video');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{if(b)await b.close();release?.();}
