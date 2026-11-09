export function newsAwake(now=Date.now()) {const d=new Date(now+28800000),m=d.getUTCHours()*60+d.getUTCMinutes();return m>=600&&m<1410;}
export function listDue(state,now=Date.now()){return newsAwake(now)&&now-(state.checkedAt||0)>=2*3600000;}
export function selectNews(items,discoveries=[],failures={},now=Date.now(),preferredProvider=null){
 const read=new Set(discoveries.flatMap(x=>[x.url,x.originUrl]));
 const interests=/游戏|科技|\bAI\b|人工智能|太空|天文|动物|机器人|软件|芯片|创作|航天|开源|宇宙/i;
 return items.filter(x=>x.url&&x.title&&interests.test(x.title)&&!read.has(x.url)&&now-(failures[x.url]||0)>6*3600000).sort((a,b)=>(Number(b.provider===preferredProvider)-Number(a.provider===preferredProvider))||Number(b.scope==='rss-content')-Number(a.scope==='rss-content'))[0];
}
export function usableArticle(r){return r&&['rss-content','article-content'].includes(r.scope)&&typeof r.text==='string'&&r.text.trim().length>=100;}
