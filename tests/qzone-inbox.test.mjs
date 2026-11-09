import test from 'node:test';import assert from 'node:assert/strict';import {qzoneSlot,incomingComments} from '../lib/qzone-inbox.mjs';
test('Beijing schedule and rest boundary',()=>{
 const at=s=>qzoneSlot(new Date('2026-11-09T'+s+'+08:00'));
 assert.equal(at('09:59:00'),null);assert.equal(at('10:00:00'),'2026-11-09:10');assert.equal(at('11:59:59'),'2026-11-09:10');assert.equal(at('12:00:00'),'2026-11-09:12');assert.equal(at('23:29:59'),'2026-11-09:22');assert.equal(at('23:30:00'),null);assert.equal(at('00:00:00'),null);
});
test('skip history/self; only nested replies targeting bot',()=>{
 const post={tid:'p',feed_ref:{}},c={comment_id:'0',user_id:'2',content:'hi',time:100,comment:{id:0,user:{uin:'2'}},replies:[{reply_id:'r',user_id:'3',target_user_id:'1',content:'reply',time:101},{reply_id:'other',user_id:'3',target_user_id:'2',content:'other',time:101}]};
 assert.equal(incomingComments(post,[c],'1',99000).length,2);assert.equal(incomingComments(post,[c],'1',102000).length,0);assert.equal(incomingComments(post,[{...c,user_id:'1',replies:[]}],'1',0).length,0);
});
