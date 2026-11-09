import {temporaryLabel,recoverTemporaryPages,releasePage} from './page-lifecycle.mjs';
import {dedicatedBrowserForeground} from './browser-focus.mjs';
export async function assertBackgroundUse(foreground=dedicatedBrowserForeground){if(await foreground()!==false)throw Object.assign(new Error('浏览器正在由你操作或前台状态未知，后台任务延后'),{code:'BROWSER_USER_ACTIVE',beforeDelivery:true});}
// Only reuse pages owned by this workspace. Native watch/chat tabs have their own labels.
export async function managedPage(context, role) {
 await assertBackgroundUse();
 const label='huohuo:'+role, matches=[];
 for(const page of context.pages())if(!page.isClosed()&&(await page.evaluate(()=>window.name).catch(()=>'')).replace(/:\d+:\d+$/,'')===label)matches.push(page);
 if(role.includes('publish')&&matches.length>1)throw new Error('发现多个发布页面，请核对草稿后再继续；没有关闭任何草稿');
 const page=matches.shift()||await backgroundPage(context);
 for(const extra of matches)await releasePage(extra).catch(()=>{});
 await page.evaluate(value=>{window.name=value;},/publish|inbox|chat/.test(role)?label:`${label}:${process.pid}:${Date.now()}`);
 return page;
}
export async function closeTemporary(page){await releasePage(page).catch(()=>{});}

// Unlike context.newPage(), CDP's background flag does not activate the tab/window.
// Reuse the native adapter's bounded target-id/context checks and owned-page cleanup.
export async function backgroundPage(context){
 const browser=context.browser();if(!browser)throw new Error('没有已连接的浏览器，未自动启动窗口');
 const authorizePrepare=()=>assertBackgroundUse();
 await authorizePrepare();
 const {harness}=await import('./runtime.mjs');const {pathToFileURL}=await import('node:url');const path=await import('node:path');
 const {createBackgroundPage}=await import(pathToFileURL(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/core.mjs')));
 await recoverTemporaryPages(context);
 const page=await createBackgroundPage(browser,context,{authorizePrepare});
 await page.evaluate(label=>{window.name=label;},temporaryLabel());
 return page;
}
