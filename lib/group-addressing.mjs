export function botAliases(aliases=[]){
 const names=new Set(aliases.filter(n=>typeof n==='string'&&n.length>0));
 if(['小伴','霍霍','祸爷','锅爷'].some(n=>names.has(n)))for(const n of ['小伴','霍霍','祸爷','锅爷'])names.add(n);
 return [...names];
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function mentionsBot(text,aliases){return botAliases(aliases).some(name=>String(text).includes(name));}
export function directAddress(text,aliases=[]){
 const t=String(text).trim();
 if(/[“”"「」『』]/.test(t))return false;
 const request='(?:说|讲|念|读|唱)(?:[一两二三四五六七八九十0-9]*句|几句|一下|一段|几段|点|个|说|讲|北京话|粤语)|发(?:个|一|几|张|条|语音|图|表情)|给(?:我|大家|我们)|用(?:语音|北京话|粤语|配置的固定音色|劫|主音色)|换(?:个|成|声音|音色)|出来(?:聊|玩|说|一下|吧|呀|啊|嘛|[，,。！？!?\\s]|$)|聊(?:聊|天|一下|两句)|陪(?:我|大家|我们)|醒醒|冒个泡';
 return botAliases(aliases).some(name=>{
  const n=escape(name);
  if(new RegExp('^(?:[喂嘿嗨诶欸哎，,！!\\s]{0,8})'+n+'(?:[，,。！!？?\\s]|$|你|在|帮|来|能|会|要|觉得|怎么|今天|刚才|'+request+')').test(t))return true;
  return new RegExp('^(?:在吗|在不在|出来(?:聊(?:天|聊)?|玩|一下)?|来聊(?:天|聊)|说句话|冒个泡|醒醒|你怎么看|你觉得呢|陪我聊(?:天|聊))(?:[呀啊吧嘛呢，,！!？?\\s]*)'+n+'(?:[呀啊吧嘛呢，,。！!？?\\s]*)$').test(t);
 });
}
