import test from 'node:test';
import assert from 'node:assert/strict';
import {readVideoSurface,inspectVideo,findVideoPage,likeControl} from '../lib/douyin-surface.mjs';
import {verifiedClick} from '../lib/browser-actions.mjs';

// Isolated browser fixtures, never connect to the signed-in CDP browser.
test('Douyin feed and detail page regression fixtures', {skip:process.env.HUOHUO_BROWSER_TESTS!=='1'}, async t=>{
 const {playwright}=await import('../lib/runtime.mjs');
 const browser=await playwright().chromium.launch({channel:'msedge',headless:true});
 t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1000,height:900}});
 const fixture=(kind='detail',id='123456789',extra='')=>`<style>video{width:320px;height:240px}button,.bar>div{width:70px;height:40px;display:inline-block}svg{width:20px;height:20px}</style>
 <main data-e2e="${kind==='detail'?'video-detail':'feed-active-video'}"><div data-e2e="player-container" class="video_${id}"><video></video><button ${kind==='detail'?'style="display:none"':''} data-e2e="video-player-digg" data-e2e-state="video-player-no-digged" onclick="like()">like</button></div>
 ${kind==='detail'?'<section data-e2e="detail-video-info">fixture<div class="bar"><div onclick="like()"><svg></svg><span>12</span></div><div>comment</div><div>collect</div><div data-e2e="video-share-icon-container">share</div></div></section>':''}</main>${extra}
 <script>window.name='deepseek-douyin-api';window.clicks=0;function like(){window.clicks++;document.querySelector('[data-e2e="video-player-digg"]').setAttribute('data-e2e-state','video-player-is-digged')}</script>`;
 async function pageFor(html,url='https://www.douyin.com/video/123456789'){
  const page=await context.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url);return page;
 }
 await t.test('detail toolbar clicks once and recognizes is-digged readback',async()=>{
  const page=await pageFor(fixture());try{
   assert.equal(await findVideoPage(context),page);
   const before=await inspectVideo(page);assert.equal(before.kind,'detail');assert.equal(before.liked,false);assert.equal(before.paused,true);
   const {button}=await likeControl(page,before.id),on=async()=>(await inspectVideo(page,before.id)).liked;
   assert.equal(await verifiedClick(button,on),true);assert.equal(await verifiedClick(button,on),false);assert.equal(await page.evaluate(()=>window.clicks),1);
  }finally{await page.close();}
 });
 await t.test('recommendation feed still works',async()=>{
  const page=await pageFor(fixture('feed'),'https://www.douyin.com/');try{
   const {state,button}=await likeControl(page,'123456789');assert.equal(state.likeTarget,'player');
   assert.equal(await verifiedClick(button,async()=>(await inspectVideo(page)).liked),true);
  }finally{await page.close();}
 });
 await t.test('changed or ambiguous video identity is rejected',async()=>{
  for(const [html,url] of [[fixture('detail','987654321'),'https://www.douyin.com/video/123456789'],[fixture('detail','123456789','<video style="width:100px;height:100px"></video>'),'https://www.douyin.com/video/123456789']]){
   const page=await pageFor(html,url);try{assert.equal((await page.evaluate(readVideoSurface)).supported,false);await assert.rejects(()=>inspectVideo(page));}finally{await page.close();}
  }
  const page=await pageFor(fixture());try{await assert.rejects(()=>inspectVideo(page,'987654321'),/已切换/);}finally{await page.close();}
 });
 await t.test('private chat, captcha and unknown like states never receive clicks',async()=>{
  for(const extra of ['<div data-e2e="im-dialog">chat</div>','<div id="captcha_container">captcha</div>']){
   const page=await pageFor(fixture('detail','123456789',extra));try{await assert.rejects(()=>likeControl(page,'123456789'));assert.equal(await page.evaluate(()=>window.clicks),0);}finally{await page.close();}
  }
  const page=await pageFor(fixture().replace('video-player-no-digged','unrecognized'));
  try{await assert.rejects(()=>likeControl(page,'123456789'));assert.equal(await page.evaluate(()=>window.clicks),0);}finally{await page.close();}
 });
 await t.test('dedicated page ownership and ambiguity are enforced',async()=>{
  const page=await pageFor(fixture());try{
   await page.evaluate(()=>window.name='deepseek-douyin-api_chat');await assert.rejects(()=>findVideoPage(context));
   await page.evaluate(()=>window.name='deepseek-douyin-api');const other=await pageFor(fixture());
   try{await assert.rejects(()=>findVideoPage(context),/多个/);}finally{await other.close();}
  }finally{await page.close();}
 });
});
