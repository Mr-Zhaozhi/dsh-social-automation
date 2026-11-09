import test from 'node:test';import assert from 'node:assert/strict';
import {botAliases,directAddress,mentionsBot} from '../lib/group-addressing.mjs';
import {compactHistory,evaluateAttention,attentionRouting} from '../lib/group-attention.mjs';
const now=1800000000000,policy={enabled:true,aliases:['小伴'],context_seconds:600,proactive_join:true,reply_threshold:.72};
const message={kind:'group',groupId:'456',userId:'123',messageId:'20',text:'锅爷真会接梗',media:[],segments:[]};
const ctx={config:{requireMention:true},selfId:()=> '321',call:async()=>({messages:[]})};
const history=(text='刚才那个故事，结尾可以换成反转')=>[{time:now/1000-20,message_id:'10',sender:{user_id:'999'},raw_message:'你怎么想'},{time:now/1000-10,message_id:'11',sender:{user_id:'321'},raw_message:text}];
test('four aliases and names at the end; descriptive mentions use contextual judgment',()=>{
 assert.deepEqual(botAliases(['小伴']),['小伴','霍霍','祸爷','锅爷']);
 for(const t of ['锅爷','祸爷你怎么看','在吗锅爷','出来聊天，锅爷','你怎么看，小伴','嘿，锅爷冒个泡','小伴，帮忙看看'])assert(directAddress(t,['小伴']),t);
 for(const t of ['刚才锅爷说的挺好笑','我觉得小伴很会接梗','群里在讨论“锅爷”这个外号','我让小伴说句北京话']){assert(mentionsBot(t,['小伴']));assert(!directAddress(t,['小伴']),t);}
 assert(!mentionsBot('这口锅烧焦了',['小伴']));
});
test('names work with no recent bot; references to its topic work across speakers',async()=>{
 let calls=0;
 const a=await evaluateAttention(message,ctx,{policy,now,decide:async d=>{calls++;assert(d.mentionsBot);return {aboutBot:true,participate:true,confidence:.96};}});assert.equal(a.reason,'discussing-bot');assert(a.wake);
 const b=await evaluateAttention({...message,text:'结尾反转会不会太突兀'}, {...ctx,call:async()=>({messages:history()})},{policy,now,decide:async()=>({continuesBotTopic:true,participate:true,confidence:.82})});assert.equal(b.reason,'bot-topic');assert(b.wake);assert.equal(calls,1);
});
test('no reply to mere quotes, unrelated transactions, low certainty or request for silence',async()=>{
 for(const a of [{aboutBot:true,participate:false,confidence:.99},{aboutBot:true,participate:true,confidence:.79},{joinConversation:false,confidence:.99}])assert.equal((await evaluateAttention(message,ctx,{policy,now,decide:async()=>a})).wake,false);
 let calls=0;
 for(const text of ['锅爷先别插话','锅爷不要回复','这单多少钱'])assert.equal((await evaluateAttention({...message,text},ctx,{policy,now,decide:async()=>{calls++;return {};}})).wake,false);assert.equal(calls,0);
});
test('direct calls and ongoing dialogue skip classification; blocked budgets do not break direct calls',async()=>{
 const trap=()=>{throw Error('unexpected classifier');};
 assert((await evaluateAttention({...message,text:'出来聊天，锅爷'},ctx,{policy,now,decide:trap,allowClassification:()=>false})).wake);
 const rows=history();rows[0].sender.user_id='123';assert.equal((await evaluateAttention({...message,text:'那然后呢'}, {...ctx,call:async()=>({messages:rows})},{policy,now,decide:trap})).reason,'ongoing-dialogue');
 assert.equal((await evaluateAttention(message,ctx,{policy,now,decide:trap,allowClassification:()=>false})).reason,'classifier-budget');
 const compact=compactHistory(Array.from({length:30},()=>({speaker:'other',text:'x'.repeat(2000)})));assert(compact.length<=12);assert(compact.reduce((n,r)=>n+r.text.length,0)<=3000);
});
test('router classifies only after native authorization and dedup, preserves pending output',async()=>{
 let blocked=true,calls=0,dispatched=0;const chat={loopBuffer:['pending'],loopPending:'pending'};
 const self={ctx:{...ctx,getChat:()=>chat,tryHandleCommand:async()=>false}};
 const original=async function(m){if(blocked)return;this.ctx.getChat().loopBuffer=[];if(await this.ctx.tryHandleCommand(m.chatId,m.text))return;dispatched++;};
 const wrapped=attentionRouting(original,{readPolicy:()=>policy,decide:async()=>{calls++;return {aboutBot:true,participate:true,confidence:.99};}});
 await wrapped.call(self,message);assert.equal(calls,0);blocked=false;await wrapped.call(self,message);assert.equal(calls,1);assert.equal(dispatched,1);assert.deepEqual(chat.loopBuffer,['pending']);assert.equal(self.ctx.config.requireMention,true);
});
