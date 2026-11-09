import test from 'node:test';import assert from 'node:assert/strict';
import {assertHomeAccess,homeTarget,ownCommentReceipt,expandCard,guardDrafts,uniqueCard} from '../lib/zhihu-home.mjs';import {homeReady} from '../plugins/zhihu-home.mjs';import {browser} from '../lib/runtime.mjs';
test('homepage capabilities enforce read-only mode and cannot clear a posting restriction',()=>{
 const c={capabilities:{read:true,browse:true,like:false}},a={blocked:true,operation:'comment'};
 assert.doesNotThrow(()=>assertHomeAccess(c,a,'read'));assert.doesNotThrow(()=>assertHomeAccess(c,a,'status'));
 assert.throws(()=>assertHomeAccess(c,a,'status',true));assert.throws(()=>assertHomeAccess(c,{},'like'));
 assert.throws(()=>assertHomeAccess(c,{blocked:true,operation:'read'},'read'));
});
test('homepage targets accept canonical visible articles and answers only',()=>{
 assert.equal(homeTarget('https://zhuanlan.zhihu.com/p/123?share=1').url,'https://zhuanlan.zhihu.com/p/123');assert.equal(homeTarget('https://www.zhihu.com/question/1/answer/2').kind,'answer');
 for(const url of ['https://zhuanlan.zhihu.com.evil.test/p/123','http://zhuanlan.zhihu.com/p/123','https://a@zhuanlan.zhihu.com/p/123','https://www.zhihu.com/question/1','https://www.zhihu.com/messages'])assert.throws(()=>homeTarget(url));
});
test('comment receipt requires new id, exact text, and authorized author',()=>{
 const row={id:'1',text:'具体评论',profile:'https://www.zhihu.com/people/me'};assert.throws(()=>ownCommentReceipt([row],['1'],row.text,row.profile));assert.throws(()=>ownCommentReceipt([row],[],row.text,'someone else'));assert.deepEqual(ownCommentReceipt([row],[],row.text,row.profile),row);assert.throws(()=>ownCommentReceipt([row,{...row,id:'2'}],[],row.text,row.profile));
});
test('read-only homepage mode cannot resume a blocked browsing operation or unverified mode',()=>{
 const c={enabled:true,mode:'home',testStatus:'home-read-verified',capabilities:{browse:true}};assert.equal(homeReady(c,{blocked:true,operation:'comment'}),true);assert.equal(homeReady(c,{blocked:true,operation:'browse'}),false);assert.equal(homeReady({...c,testStatus:'awaiting-live-validation'},{}),false);assert.equal(homeReady({...c,enabled:false},{}),false);
});
test('rendered card guards distinguish full body, duplicate targets, and user drafts',{skip:process.env.HUOHUO_BROWSER_TESTS!=='1'},async()=>{
 const b=await browser();const p=await b.contexts()[0].newPage();
 try{
  const html='<div class="ContentItem ArticleItem"><meta itemprop="url" content="https://zhuanlan.zhihu.com/p/123"><h2 class="ContentItem-title">标题</h2><div class="RichText">真实正文</div><button>收起</button><div class="CommentContent">别人的评论</div><div contenteditable="true" class="RichText RichText--editable"></div></div>';
  await p.setContent(html);const target=homeTarget('https://zhuanlan.zhihu.com/p/123');assert.equal((await expandCard(p,target)).content.text,'真实正文');await guardDrafts(p);await p.locator('[contenteditable]').fill('自己的草稿');await assert.rejects(guardDrafts(p),/草稿/);
  await p.setContent(html+html);await assert.rejects(uniqueCard(p,target),/唯一/);
  await p.setContent(html.replace('<button>收起</button>',''));await assert.rejects(expandCard(p,target),/展开正文/);
 }finally{await p.close();await b.close();}
});
