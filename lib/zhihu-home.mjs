import {zhihuURL} from './zhihu-state.mjs';
export function assertHomeAccess(config,access,command,resume=false){
 if(resume&&access.blocked)throw new Error('首页可读不能证明发送限制已解除；保留暂停和未知发送记录');
 if(command==='status')return;
 const capability=command==='comments'?'read':command;
 if(config.capabilities?.[capability]!==true)throw new Error('该首页能力尚未通过验收或已暂停：'+capability);
 if(access.blocked&&!(access.operation==='comment'&&['browse','read','comments'].includes(command)))throw new Error('知乎首页已暂停，需要本人核对后恢复');
}
export function homeTarget(value){
 const u=new URL(value);
 if(u.protocol==='https:'&&u.hostname==='zhuanlan.zhihu.com'&&!u.username&&!u.password&&!u.port&&/^\/p\/\d+$/.test(u.pathname))return {url:u.origin+u.pathname,id:u.pathname.split('/').at(-1),kind:'article'};
 const a=zhihuURL(value);if(!a.answerId)throw new Error('首页模式只操作已有完整回答或文章');return {url:a.url,id:a.answerId,kind:'answer'};
}
export function cardFor(page,target){return page.locator('.ContentItem').filter({has:page.locator(`meta[itemprop="url"][content="${target.url}"]`)});}
export async function uniqueCard(page,target){const card=cardFor(page,target);if(await card.count()!==1)throw new Error('当前首页没有唯一目标内容；未跳转详情、未刷新重找');return card;}
export async function guardDrafts(scope){for(const e of await scope.locator('[contenteditable="true"]:visible,textarea:visible').all())if((await e.evaluate(e=>'value'in e?e.value:e.innerText)).trim())throw new Error('首页已有未发送草稿，保留并暂停');}
export async function expandCard(page,target){
 const card=await uniqueCard(page,target),more=card.getByRole('button',{name:/^阅读全文/});
 if(await more.count()===1){await guardDrafts(card);await more.click();await card.getByRole('button',{name:/^收起\s*​?$/}).waitFor({timeout:12000});}
 const body=card.locator('.RichText:not(.RichText--editable)').filter({hasNot:page.locator('[contenteditable=true]')});
 if(await body.count()!==1||!await card.getByRole('button',{name:/^收起\s*​?$/}).count())throw new Error('尚未取得唯一展开正文，不能按摘要互动');
 const text=(await body.innerText()).trim();if(!text)throw new Error('正文为空');
 if(/购买.*阅读全文|开通.*阅读全文|登录.*阅读全文/.test(await card.innerText()))throw new Error('正文尚未完整开放');
 return {card,content:{url:target.url,kind:target.kind,title:await card.locator('.ContentItem-title').innerText(),text:text.slice(0,16000),truncated:text.length>16000,images:await body.locator('img').count(),scope:'homepage-expanded'}};
}
export async function openComments(page,target){
 const card=await uniqueCard(page,target);const opened=card.getByRole('button',{name:/收起评论/});
 if(!await opened.count()){const toggle=card.getByRole('button',{name:/条评论|添加评论/});if(await toggle.count()!==1)throw new Error('评论入口不唯一');await toggle.click();}
 await card.locator('[contenteditable=true]').first().waitFor({timeout:12000});return card;
}
export async function visibleComments(card){return card.locator('[data-id]').evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.getAttribute('data-id'))&&e.querySelector('.CommentContent')).map(e=>{
 const content=e.querySelector('.CommentContent'),parent=content.parentElement,authors=[...parent.querySelectorAll('a[href*="/people/"]')];
 return {id:e.getAttribute('data-id'),text:content.innerText.trim(),author:authors[0]?.innerText,profile:authors[0]?.href,replyTo:authors[1]?.innerText,replyToProfile:authors[1]?.href};
}));}
export function ownCommentReceipt(rows,oldIds,text,profile){const matches=rows.filter(r=>!oldIds.includes(r.id)&&r.text===text&&r.profile===profile);if(matches.length!==1)throw new Error('没有唯一的新评论身份与编号，保留结果待核查');return matches[0];}
