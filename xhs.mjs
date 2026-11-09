import {assertPlatformAvailable} from './lib/platform-holds.mjs';
assertPlatformAvailable('xiaohongshu');
import {browser,waitForLock,workspace,atomicJSON} from './lib/runtime.mjs';
import {managedPage,backgroundPage,closeTemporary} from './lib/browser-pages.mjs';import {browseFeed} from './lib/xhs-feed.mjs';import path from 'node:path';
import {beginWatch} from './lib/watch-budget.mjs';
import {assertWatcher} from './lib/fleet.mjs';
import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
await assertWatcher('xiaohongshu');await assertBrowserAvailable();
const cmd = process.argv[2] || 'search';

async function withPage(fn) {
  const release=await waitForLock('browser-actions');let budget,timer,b,page;
  try {
   budget=beginWatch();b=await browser();page=cmd==='browse'?await managedPage(b.contexts()[0],'xhs-browse'):await backgroundPage(b.contexts()[0]);
   timer=setTimeout(()=>void page.close().catch(()=>{}),budget.allowedMs);
   return await fn(page);
  }finally{clearTimeout(timer);try{await closeTemporary(page);await b?.close();}finally{budget?.finish();release();}}
}

async function search(page, kw) {
  await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(kw)}&source=web_search_result_notes`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {const v=window.__INITIAL_STATE__?.search?.feeds;return Array.isArray(v?.value||v?._value||v)&&(v?.value||v?._value||v).length>0;}, null, {timeout:20000});
  return page.evaluate(() => {
    const raw = window.__INITIAL_STATE__?.search?.feeds;
    const arr = (raw && (raw.value || raw._value || raw)) || [];
    return arr.filter(Boolean).map(x => ({
      id: x.id,
      token: x.xsecToken || '',
      title: x.noteCard?.displayTitle || '',
      author: x.noteCard?.user?.nickname || '',
      likes: x.noteCard?.interactInfo?.likedCount || '',
    }));
  });
}

if(cmd==='browse'){
 await withPage(async page=>{if(!page.url().startsWith('https://www.xiaohongshu.com/explore'))await page.goto('https://www.xiaohongshu.com/explore',{waitUntil:'domcontentloaded'});const result=await browseFeed(page,Number(process.argv[3]||3));atomicJSON(path.join(workspace,'.state/xhs-browse.json'),{at:new Date().toISOString(),...result});console.log(JSON.stringify(result));});
} else if (cmd === 'search') {
  const kw = process.argv[3] || '';
  const n = Number(process.argv[4] || 10);
  if (!Number.isInteger(n)||n<1||n>30) throw new Error("条数须为 1–30");
  await withPage(async page => {
    const list = await search(page, kw);
    if (!list.length) throw new Error('未取得搜索结果，可能未登录或页面需要验证');
    list.slice(0, n).forEach((x, i) => {
      console.log(`${i + 1}. ${x.title}  [@${x.author} 赞${x.likes}]  https://www.xiaohongshu.com/explore/${x.id}?xsec_token=${encodeURIComponent(x.token)}&xsec_source=pc_search`);
    });
  });
} else if (cmd === 'read') {
  const kw = process.argv[3] || '';
  const idx = Number(process.argv[4] || 1) - 1;
  if (!Number.isInteger(idx)||idx<0||idx>29) throw new Error("序号须为 1–30");
  await withPage(async page => {
    const list = await search(page, kw);
    const item = list[idx];
    if (!item) throw new Error('没有第 ' + (idx + 1) + ' 条');
    const url = `https://www.xiaohongshu.com/explore/${item.id}?xsec_token=${encodeURIComponent(item.token)}&xsec_source=pc_search`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#detail-desc').waitFor({state:'visible',timeout:15000});
    const d = await page.evaluate(() => {
      const q = s => document.querySelector(s)?.innerText?.trim() || '';
      const imgs = [...document.querySelectorAll('.note-slider img, .swiper-slide img, .media-container img')].map(i => i.src).filter(Boolean);
      return { title: q('#detail-title') || document.title, desc: q('#detail-desc'), author: q('.author-wrapper .name'), likes: q('.like-wrapper .count'), imgs };
    });
    console.log(`标题: ${d.title}\n作者: ${d.author}  赞: ${d.likes}  图: ${d.imgs.length}张`);
    console.log(`正文: ${d.desc.slice(0, 900)}`);
    if (d.imgs[0]) console.log(`首图: ${d.imgs[0].split('?')[0]}`);
  });
} else {
  console.log('用法:\n  ./xhs.sh browse [页数1–6]\n  ./xhs.sh search <关键词> [条数]\n  ./xhs.sh read <关键词> <第几条>');
}
