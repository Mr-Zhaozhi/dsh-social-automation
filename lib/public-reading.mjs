// HTTP HTML can have >100 KB of CSS/scripts before the article begins.
// Increase the HTML cap for this one reader, then pass only main/article text
// to the model. Never mutate the shared provider or lift its byte/URL limits.
export async function readPublicBody(web,url,render){
 const original=web.selectFetchProvider();let reader=original;
 if(original.limits&&typeof original.followAndRead==='function'){
  reader=Object.create(Object.getPrototypeOf(original),Object.getOwnPropertyDescriptors(original));
  Object.defineProperty(reader,'limits',{value:{...original.limits,maxBodyChars:Math.min(original.limits.maxResponseBytes,2000000)},writable:true,configurable:true});
 }
 const result=await reader.fetch({url},AbortSignal.timeout(30000));
 if(result.statusCode<200||result.statusCode>=300)throw Error('公开正文读取失败');
 let body=result.body;
 if(body?.kind==='html'){
  const article=body.content.match(/<(article|main)\b[^>]*>[\s\S]*?<\/\1>/i)?.[0];
  if(!article)throw Error('没有定位到正文区域，不把导航当作见闻');
  body={...body,content:article};
 }
 const text=render({...result,body},100000).slice(0,6500);
 if(text.length<700)throw Error('正文不足');
 return text;
}
