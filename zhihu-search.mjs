import fs from 'node:fs';import path from 'node:path';
import {browser,workspace,waitForLock,atomicJSON} from './lib/runtime.mjs';
import {managedPage,closeTemporary,assertBackgroundUse} from './lib/browser-pages.mjs';import {assertBrowserAvailable} from './lib/browser-scheduling.mjs';import {assertPlatformAvailable} from './lib/platform-holds.mjs';import {accessProblem} from './lib/zhihu-state.mjs';import {guardDrafts} from './lib/zhihu-home.mjs';
import {searchQuery,normalizeResults,assertSearchAllowed,searchDenial,expandSearchResult,searchResultURL} from './lib/zhihu-search.mjs';
const args=process.argv.slice(2),read=(name,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(workspace,name)));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}},stateFile=path.join(workspace,'.state/zhihu-search-access.json');
let b,p,release,timer,denied=false,submittedQuery='';const denials=[];
async function check(){const text=(await p.locator('body').innerText()).slice(0,24000);const problem=accessProblem(text,p.url());if(denied||problem){if(denied||problem==='restricted')atomicJSON(stateFile,{blocked:true,reason:problem||'search-request-denied',evidence:denials,at:new Date().toISOString()});throw Error(problem==='login-required'?'知乎需要登录':'知乎搜索受限，已停止；未打开任何详情页');}}
try{
 const opt=n=>args.includes('--'+n)?args[args.indexOf('--'+n)+1]:'';
 const cached=read('.state/zhihu-search-results.json');const requested=opt('read-url')||(args[0]==='read'?opt('url'):'');
 const cachedQuery=requested&&cached.at&&Date.now()-cached.at<86400000&&cached.items?.some(i=>i.url===searchResultURL(requested))?cached.query:'';
 const query=searchQuery(opt('query')||cachedQuery);const readIndex=opt('read-index');if(readIndex&&!/^(?:[1-9]|10)$/.test(readIndex))throw Error('read-index需要1至10');
 assertPlatformAvailable('zhihu');const prior=read('.state/zhihu-search-access.json');const verifyLegacy=args.includes('--verify-legacy-hold')&&prior.blocked&&prior.reason==='HTTP-403'&&!prior.evidence;assertSearchAllowed(read('zhihu.json'),read('.state/zhihu-home-access.json'),verifyLegacy?{}:prior);
 await assertBrowserAvailable();release=await waitForLock('browser-actions',{timeoutMs:8000});b=await browser();p=await managedPage(b.contexts()[0],'zhihu-search');
 p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(20000);timer=setTimeout(()=>void p.close().catch(()=>{}),45000);
 p.on('response',r=>{try{const req=r.request();if(searchDenial({url:r.url(),status:r.status(),resourceType:req.resourceType(),mainFrame:req.frame()===p.mainFrame()})){denied=true;denials.push({status:r.status(),path:new URL(r.url()).pathname});}}catch{}});
 await guardDrafts(p);await p.goto('https://www.zhihu.com/',{waitUntil:'domcontentloaded'});await check();
 const input=p.locator('input.SearchBar-input:visible,input[role="combobox"]:visible');if(await input.count()!==1)throw Error('首页搜索输入框不唯一或未加载');
 await input.fill(query);submittedQuery=query;await input.press('Enter');
 await p.waitForURL(u=>u.origin==='https://www.zhihu.com'&&u.pathname==='/search',{timeout:15000});await check();
 await p.waitForFunction(()=>document.querySelector('.SearchResult-Card,.SearchResult .ContentItem')||/没有找到|暂无搜索结果|暂时限制本次访问|当前请求存在异常/.test(document.body.innerText),null,{timeout:12000});await check();
 const raw=await p.locator('.SearchResult-Card').evaluateAll(cards=>cards.map(c=>{const title=c.querySelector('.ContentItem-title');const link=title?.querySelector('a[href]');return {title:title?.innerText,url:link?.href,excerpt:c.querySelector('.RichContent-inner,.RichText,.SearchItem-excerpt')?.innerText||''};}));
 const items=normalizeResults(raw);if(!items.length&&!/没有找到|暂无搜索结果/.test(await p.locator('body').innerText()))throw Error('搜索页面已打开，但未识别出结果；不能判断为无结果或访问受限');if(verifyLegacy)atomicJSON(stateFile,{blocked:false,reason:'verified-visible-search-results',results:items.length,at:new Date().toISOString()});atomicJSON(path.join(workspace,'.state/zhihu-search-results.json'),{at:Date.now(),query,items});
 if(requested||readIndex){const target=requested||items[Number(readIndex)-1]?.url;if(!target)throw Error('选择的搜索结果不存在');const content=await expandSearchResult(p,target);await check();console.log(JSON.stringify({status:content.complete?'read':'partial',query,...content}));}else console.log(JSON.stringify({status:items.length?'results':'no-results',query,items,detailsOpened:false,complete:false,note:'仅搜索结果标题与摘要，未读取回答全文。'}));
}catch(e){console.log(JSON.stringify({status:'unavailable',error:e.message,detailsOpened:false,complete:false}));process.exitCode=1;}
finally{clearTimeout(timer);try{if(p&&!p.isClosed()&&submittedQuery){try{await assertBackgroundUse();await p.evaluate(query=>{for(const e of document.querySelectorAll('input'))if(e.value===query)e.value='';},submittedQuery);}catch{}}await closeTemporary(p);await b?.close();}finally{release?.();}}
