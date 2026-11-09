// Runs inside the existing conversation DOM; system hints never become messages.
export function xhsMessageRows(es){return es.filter(e=>e.dataset.contentType!=='4').map(e=>{
 const text=e.querySelector('.xhs-im-bubble__text')?.textContent||e.innerText||'';
 const urls=[...e.querySelectorAll('a[href],[data-url]')].map(a=>a.href||a.dataset.url);
 urls.push(...(text.match(/https:\/\/www\.xiaohongshu\.com\/(?:explore|discovery\/item)\/[^\s<>]+/g)||[]));
 const url=urls.find(value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.xiaohongshu.com'&&/^\/(explore|discovery\/item)\/[a-f0-9]{24}\/?$/.test(u.pathname);}catch{return false;}});
 return {id:e.dataset.messageId,mine:!!e.querySelector('.chat-item__bubble--me'),text:text.slice(0,4000),...(url?{sharedUrl:url}:{}),unsupported:e.dataset.contentType!=='1'&&!url,failed:!!e.querySelector('[class*=failed],[class*=error]')};
});}
