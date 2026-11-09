export function searchQuery(value){const query=String(value||'').trim();if(!query||[...query].length>80||/[\r\n\x00-\x1f]/.test(query))throw Error('关键词需要1至80字，不能含控制字符');return query;}
export function searchResultURL(value){try{const u=new URL(value,'https://www.zhihu.com');if(u.protocol!=='https:'||u.username||u.password||u.port)return null;if(u.hostname==='www.zhihu.com'&&/^\/question\/\d+(\/answer\/\d+)?\/?$/.test(u.pathname)||u.hostname==='zhuanlan.zhihu.com'&&/^\/p\/\d+\/?$/.test(u.pathname))return u.origin+u.pathname;return null;}catch{return null;}}
export function normalizeResults(rows){const seen=new Set();return rows.flatMap(row=>{const url=searchResultURL(row.url),title=String(row.title||'').trim();if(!url||!title||seen.has(url))return[];seen.add(url);return [{url,title:title.slice(0,200),excerpt:String(row.excerpt||'').trim().slice(0,1400),scope:'search-result-excerpt',complete:false}];}).slice(0,10);}
export function assertSearchAllowed(config,homeAccess,searchAccess){
 if(!config.enabled||config.capabilities?.read!==true)throw Error('知乎阅读未启用');
 if(homeAccess?.blocked&&homeAccess.operation!=='comment')throw Error('知乎首页访问暂停，未搜索');
 if(searchAccess?.blocked)throw Error('知乎搜索上次受限，等待本人核对恢复，不重复请求');
}
export function searchDenial({url,status,resourceType,mainFrame=false}){
 if(status!==403&&status!==429)return false;
 try{const u=new URL(url);if(u.hostname!=='www.zhihu.com')return false;
 return (resourceType==='document'&&mainFrame&&(u.pathname==='/'||u.pathname==='/search'))||/^\/api\/v\d+\/search(?:_v\d+)?\/?$/.test(u.pathname);
 }catch{return false;}
}
export async function expandSearchResult(page,url){
 const target=searchResultURL(url);if(!target||!(/\/answer\//.test(target)||/\/p\//.test(target)))throw Error('展开需要唯一回答或文章链接');
 const cards=page.locator('.SearchResult-Card');const urls=await cards.evaluateAll(es=>es.map(e=>e.querySelector('.ContentItem-title a')?.href||''));const indices=urls.flatMap((u,i)=>searchResultURL(u)===target?[i]:[]);if(indices.length!==1)throw Error('搜索结果中没有唯一目标卡片');
 const card=cards.nth(indices[0]),more=card.getByRole('button',{name:/^阅读全文/});const before=page.url();let navigationBlocked=false;
 const guard=async route=>{const req=route.request();if(req.isNavigationRequest()&&req.frame()===page.mainFrame()){navigationBlocked=true;await route.abort();}else await route.continue();};
 await page.route('**/*',guard);
 try{
  if(await more.count()===1){await more.click();await more.waitFor({state:'hidden',timeout:10000});}
  if(navigationBlocked||page.url()!==before)throw Error('该按钮要求跳转详情，未继续读取');
  const body=card.locator('.RichContent-inner .RichText:not(.RichText--editable)');if(await body.count()!==1)throw Error('未取得唯一展开正文');
  const text=(await body.innerText()).trim(),visible=await card.innerText();
  const collapsed=await more.count()>0&&await more.isVisible(),gated=/购买.*阅读全文|开通.*阅读全文|登录.*阅读全文|会员.*解锁/.test(visible);
  const expanded=await card.getByRole('button',{name:/^收起/}).count()>0;
  const images=await body.locator('img').evaluateAll(es=>es.map(e=>({url:e.currentSrc||e.src,alt:e.alt||''})).filter(e=>/^https:\/\//.test(e.url)).slice(0,20));
  return {url:target,title:(await card.locator('.ContentItem-title').innerText()).trim(),text:text.slice(0,24000),complete:!!text&&expanded&&!collapsed&&!gated&&text.length<=24000,scope:'search-result-expanded',images,imagesUnderstood:false,detailsOpened:false};
 }finally{await page.unroute('**/*',guard);}
}
