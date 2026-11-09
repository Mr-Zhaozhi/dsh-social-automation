import {homeTarget} from './zhihu-home.mjs';
export function visibleTarget(url){return homeTarget(url);}
export function candidatePages(tabs,target){return tabs.filter(p=>{
 if(p.type!=='page')return false;
 try {const u=new URL(p.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='www.zhihu.com'&&u.pathname==='/')||visibleTarget(p.url).url===target.url);}catch{return false;}
}).sort((a,b)=>(a.url.split('?')[0]===target.url?-1:0)-(b.url.split('?')[0]===target.url?-1:0)).slice(0,3);}
// DOM-only: no navigation, clicks, network requests or private application state.
export function readVisible(target){
 const pageText=document.body?.innerText||'';
 if(/当前请求存在异常|暂时限制本次访问|安全验证|请完成验证|请求过于频繁|访问受限/.test(pageText))return {status:'restricted',text:'',complete:false};
 const canonical=value=>{try{const u=new URL(value,location.href);return u.origin+u.pathname.replace(/\/$/,'');}catch{return'';}};
 const isDetail=canonical(location.href)===target.url;
 const cards=[...document.querySelectorAll('.ContentItem')].filter(e=>[...e.querySelectorAll('meta[itemprop="url"]')].some(m=>canonical(m.content)===target.url));
 let scope;
 if(isDetail){scope=cards.length===1?cards[0]:document.querySelector('.Post-RichTextContainer')||document.querySelector('.AnswerItem');}
 else if(cards.length===1)scope=cards[0];
 if(!scope)return {status:'target-not-visible',text:'',complete:false};
 const bodies=scope.matches('.Post-RichTextContainer')?[scope]:[...scope.querySelectorAll('.RichContent-inner .RichText:not(.RichText--editable),.RichContent-inner .RichContent-inner')];
 const body=bodies.find(e=>e.getBoundingClientRect().width>0)||scope.querySelector('.RichText:not(.RichText--editable)');
 if(!body||!body.getBoundingClientRect().width)return {status:'body-not-visible',text:'',complete:false};
 const text=body.innerText.trim(),collapsed=!!scope.querySelector('.is-collapsed')||[...scope.querySelectorAll('button')].some(e=>/^阅读全文/.test(e.innerText.trim()));
 const gated=/购买.*阅读全文|开通.*阅读全文|登录.*阅读全文|会员.*解锁/.test(scope.innerText);
 const rect=body.getBoundingClientRect(),x=Math.max(0,rect.left),y=Math.max(0,rect.top),width=Math.min(innerWidth,rect.right)-x,height=Math.min(innerHeight,rect.bottom)-y;
 const images=[...body.querySelectorAll('img')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({url:e.currentSrc||e.src,alt:e.alt||''})).filter(i=>{try{const u=new URL(i.url);return u.protocol==='https:'&&(/(^|\.)zhimg\.com$/.test(u.hostname)||u.hostname==='picx.zhimg.com');}catch{return false;}}).slice(0,20);
 return {status:!text?'empty':gated?'partial-gated':collapsed?'partial-collapsed':'read',url:target.url,scope:isDetail?'opened-detail':'existing-home-card',title:scope.querySelector('.ContentItem-title')?.innerText||document.title,text:text.slice(0,16000),complete:!!text&&!gated&&!collapsed&&text.length<=16000,images,imagesUnderstood:false,clip:width>1&&height>1?{x:x+scrollX,y:y+scrollY,width,height,scale:1}:null};
}
export async function cdpCall(url,method,params={},timeoutMs=6000){
 const parsed=new URL(url);if(parsed.protocol!=='ws:'||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw Error('仅接受本机浏览器连接');
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(url);let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);ws.close();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('浏览器只读请求超时')),timeoutMs);
  ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method,params})));
  ws.addEventListener('message',e=>{try{const d=JSON.parse(String(e.data));if(d.id===1)finish(d.error?Error('浏览器只读请求失败'):null,d.result);}catch{finish(Error('浏览器响应不可读'));}});
  ws.addEventListener('error',()=>finish(Error('浏览器连接失败')));ws.addEventListener('close',()=>{if(!done)finish(Error('浏览器连接关闭'));});
 });
}
