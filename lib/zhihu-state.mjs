import crypto from 'node:crypto';
export function zhihuURL(value,{questionOnly=false}={}){
 const u=new URL(value,'https://www.zhihu.com');
 if(u.protocol!=='https:'||u.hostname!=='www.zhihu.com'||u.username||u.password||u.port)throw new Error('只接受已核对的知乎问题或回答链接');
 const m=u.pathname.match(/^\/question\/(\d+)(?:\/answer\/(\d+))?\/?$/);
 if(!m||questionOnly&&m[2])throw new Error('需要知乎问题或回答的完整链接');
 return {url:'https://www.zhihu.com/question/'+m[1]+(m[2]?'/answer/'+m[2]:''),questionId:m[1],answerId:m[2]||null};
}
export const textKey=text=>crypto.createHash('sha256').update(String(text).replace(/\s+/g,' ').trim()).digest('hex');
export function newNotifications(state,rows){
 const fresh=state.initialized?rows.filter(r=>!state.seen.includes(r.key)&&r.replyable):[];
 state.initialized=true;state.seen=[...new Set([...(state.seen||[]),...rows.map(r=>r.key)])].slice(-2000);return fresh;
}
export function accessProblem(text,url=''){
 if(/当前请求存在异常|暂时限制本次访问|安全验证|请完成验证|请求过于频繁|访问受限|验证码.*验证/.test(text))return 'restricted';
 if(url.includes('/signin')||/登录后.*(评论|回答)|登录或注册/.test(text))return 'login-required';return null;
}
export function assertMaySend(ledger,key){if(ledger[key]&&ledger[key].status!=='not-sent')throw new Error('本次操作已有记录，先核查回执，禁止重复发送');}
export function assertRecoveryPage(previous,{url,answerCount}){
 if(!previous.blocked||previous.reason!=='restricted')return;
 let target;try{target=zhihuURL(url);}catch{}
 if(!target||!Number.isInteger(answerCount)||answerCount<1)throw new Error('首页登录成功不代表回答访问恢复；请先正常打开一篇含正文的回答，再解除暂停');
}
