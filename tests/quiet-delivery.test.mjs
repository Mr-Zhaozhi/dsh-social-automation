import test from 'node:test';
import assert from 'node:assert/strict';
import {quietAssistantHandler} from '../lib/quiet-delivery.mjs';
test('quiet delivery removes progress text but preserves tool cards and message identity',()=>{
 const original=function(id,chat,message){return message;};
 const handle=quietAssistantHandler(original),receiver={ctx:{effectiveInterim:()=>false}},chat={loopPending:'旧进度'};
 const message={id:'same-id',content:[{type:'text',text:'正在生成语音'},{type:'tool-call',name:'ask_user_question'}]};
 const forwarded=handle.call(receiver,'private:123456',chat,message);
 assert.equal(chat.loopPending,null);assert.equal(forwarded.id,message.id);assert.deepEqual(forwarded.content,[message.content[1]]);
 assert.equal(message.content.length,2);
});
test('silent completion and empty completion clear stale text, normal answers remain',()=>{
 const handle=quietAssistantHandler((_id,_chat,message)=>message),receiver={ctx:{effectiveInterim:()=>false}},chat={loopPending:'进度'};
 for(const text of ['<HUOHUO_NO_TEXT>','']){
  chat.loopPending='进度';const output=handle.call(receiver,'private:123456',chat,{content:[{type:'text',text}]});
  assert.equal(chat.loopPending,null);assert.deepEqual(output.content,[]);
 }
 const normal={content:[{type:'text',text:'这条语音没发成功，我先用文字说。'}]};
 assert.equal(handle.call(receiver,'private:123456',chat,normal),normal);
 const quote={content:[{type:'text',text:'你问的 <HUOHUO_NO_TEXT> 是内部标记。'}]};
 assert.equal(handle.call(receiver,'private:123456',chat,quote),quote);
});
