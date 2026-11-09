export async function visibleFeed(page){
 return page.locator('section.note-item').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>100&&r.top<innerHeight-40&&r.width>0;}).map(e=>({id:e.getAttribute('data-note-id'),title:e.querySelector('.title')?.textContent?.trim()||'',author:e.querySelector('.author .name')?.textContent?.trim()||'',url:e.querySelector('a.cover')?.href})).filter(x=>x.id&&x.url));
}
export async function browseFeed(page,pages=3){
 if(!Number.isInteger(pages)||pages<1||pages>6)throw new Error('浏览页数须为1–6');
 await page.locator('section.note-item').first().waitFor({timeout:20000});const frames=[];
 for(let i=0;i<pages;i++){
  const cards=await visibleFeed(page);if(!cards.length)throw new Error('没有可见笔记，不能声称正在浏览');frames.push({page:i+1,cards});
  if(i===pages-1)break;
  const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));await page.mouse.move(Math.round(size.width*.65),Math.round(size.height*.65));await page.mouse.wheel(0,Math.round(size.height*.8));
  const ids=cards.map(x=>x.id);await page.waitForFunction(ids=>{const now=[...document.querySelectorAll('section.note-item')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>100&&r.top<innerHeight-40;}).map(e=>e.getAttribute('data-note-id'));return now.length>0&&JSON.stringify(now)!==JSON.stringify(ids);},ids,{timeout:8000}).catch(()=>{throw new Error('滚动后可见内容未变化，本轮停止');});
 }
 return {scrolled:frames.length-1,frames};
}
