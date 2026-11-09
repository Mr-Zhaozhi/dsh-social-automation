import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {config,workspace} from './lib/runtime.mjs';
import {visibleTarget,candidatePages,readVisible,cdpCall} from './lib/zhihu-visible.mjs';
const args=process.argv.slice(2),value=args[args.indexOf('--url')+1];
try{
 if(!args.includes('--url'))throw Error('用法 zhihu-visible.mjs --url 知乎回答链接 [--screenshot]');
 const target=visibleTarget(value),endpoint=new URL(config.browser_cdp);
 if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw Error('需要本机专用浏览器');
 const response=await fetch(new URL('/json/list',endpoint),{signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('浏览器页面列表不可用');
 const pages=candidatePages(await response.json(),target);let result={status:'not-open',url:target.url,text:'',complete:false,hint:'请在专用浏览器正常打开该回答后再读取；不自动重试受限详情页。'};
 for(const page of pages){
  const raw=await cdpCall(page.webSocketDebuggerUrl,'Runtime.evaluate',{expression:`(${readVisible.toString()})(${JSON.stringify(target)})`,returnByValue:true});
  if(raw.exceptionDetails)throw Error('页面正文提取失败');const row=raw.result?.value;
  if(!row)continue;
  result={...row,url:target.url};
  if(row.text){
   if(args.includes('--screenshot')&&row.clip){
    try{const shot=await cdpCall(page.webSocketDebuggerUrl,'Page.captureScreenshot',{format:'png',clip:row.clip,captureBeyondViewport:false});const directory=path.join(workspace,'.state/preview');fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'zhihu-'+createHash('sha256').update(target.url).digest('hex').slice(0,16)+'.png');fs.writeFileSync(file,Buffer.from(shot.data,'base64'),{mode:0o600});result.screenshot=file;}catch{result.screenshotError='截图失败，正文仍可用';}
   }break;
  }
  if(row.status==='restricted')break;
 }
 delete result.clip;console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({status:'unavailable',text:'',complete:false,error:e.message}));process.exitCode=1;}
