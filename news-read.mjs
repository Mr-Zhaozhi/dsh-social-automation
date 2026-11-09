import {browser,waitForLock} from './lib/runtime.mjs';
import {backgroundPage,closeTemporary,assertBackgroundUse} from './lib/browser-pages.mjs';
import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';
export function newsURL(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='www.toutiao.com'||u.port||u.username||u.password||!/^\/(article|trending)\/\d+\/$/.test(u.pathname))throw Error('需要今日头条文章或热榜话题链接');return u.origin+u.pathname;}
export async function readToutiao(raw){
 let b,p,release,timer;
 try{
  const url=newsURL(raw);await assertBrowserAvailable();release=await waitForLock('browser-actions',{timeoutMs:8000});b=await browser();p=await backgroundPage(b.contexts()[0]);
  timer=setTimeout(()=>void p?.close().catch(()=>{}),45000);p.setDefaultNavigationTimeout(20000);
  const visit=async u=>{await assertBackgroundUse();const r=await p.goto(u,{waitUntil:'domcontentloaded'});if(r&&[401,403,429].includes(r.status()))throw Error('新闻页面访问受限，停止读取');};
  const check=async()=>{const t=await p.locator('body').innerText();if(/访问过于频繁|完成验证|安全验证|请求存在异常|拖动滑块/.test(t))throw Error('新闻页面要求验证，停止读取');};
  await visit(url);await check();
  if(new URL(url).pathname.startsWith('/trending/')){
   await p.waitForFunction(()=>[...document.querySelectorAll('a[href]')].some(a=>/\/article\/\d+\//.test(a.href)),null,{timeout:12000});await check();
   const links=await p.locator('a[href]').evaluateAll(as=>as.filter(a=>a.getClientRects().length&&a.innerText.trim().length>8).map(a=>({url:a.href,title:a.innerText.trim()})));
   const target=links.find(x=>{try{return new URL(x.url).hostname==='www.toutiao.com'&&/^\/article\/\d+\/$/.test(new URL(x.url).pathname);}catch{return false;}});
   if(!target)throw Error('热榜话题没有可读取的公开文章');await visit(newsURL(target.url));
  }
  await p.locator('article,.article-content,.tt-article-content').first().waitFor({state:'visible',timeout:12000});await check();
  const content=await p.locator('article,.article-content,.tt-article-content').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.innerText).sort((a,b)=>b.length-a.length)[0]||'');
  if(content.trim().length<100)throw Error('未读到足够正文，不以标题代替');
  return {url:p.url(),requestedUrl:url,title:await p.title(),scope:'article-content',text:content.slice(0,6500),complete:false,note:'读取当前可见正文，可能截断；不是全篇完整性保证'};
 }finally{clearTimeout(timer);try{await closeTemporary(p);await b?.close();}finally{release?.();}}
}
if(process.argv[1]?.endsWith('/news-read.mjs'))try{console.log(JSON.stringify(await readToutiao(process.argv[2])));}catch(e){console.log(JSON.stringify({scope:'unavailable',error:e.message,complete:false}));process.exitCode=1;}
