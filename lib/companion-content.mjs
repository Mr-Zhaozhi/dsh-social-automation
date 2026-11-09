// Proactive openers have chat history, not proof of a new browsing/physical activity.
export function proactiveProblem(text,{evidence=[],sourceId}={}){
 if(typeof text!=='string'||!text.trim()||[...text].length>100)return 'invalid-text';
 if(/\[表情(?:包)?\s*[:：]/.test(text))return 'image-placeholder';
 if(!evidence.some(x=>x.id===sourceId&&x.status==='observed-web'&&Date.now()-x.at<48*3600000)&&/(?:逛.{0,5}(?:看到|看了)|刷到|看到(?:个|一个|一篇|一条|一段)|看了(?:个|一个|一篇|一条|一段)|听说|据说|研究表明|专家说|新闻说)/.test(text))return 'unverified-source';
 if(/(?:我(?:刚|今天|刚才|上午|下午|昨天|正在)?(?:出门|吃了|喝了|买了|去过|路过|下班|上班|做了个梦))/.test(text))return 'invented-physical-experience';
 if(/(?:有事(?:直说|吗|没)|找我(?:什么|啥)事|怎么不(?:回|理)我|你不回我|是不是不想理我)/.test(text))return 'pressuring-opener';
 if(/(?:大嫂|老婆|老公|家人|朋友|她|他).{0,10}(?:小心眼|蠢|傻子|废物)/.test(text))return 'unfounded-third-party-insult';
 return null;
}
