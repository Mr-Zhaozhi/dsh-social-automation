import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {zhihuURL,newNotifications,accessProblem,assertMaySend,assertRecoveryPage} from '../lib/zhihu-state.mjs';import {SocialBudget} from '../lib/social-budget.mjs';import {beginWatch} from '../lib/watch-budget.mjs';
test('homepage login cannot clear a restricted answer page; real answer content is required',()=>{
 const previous={blocked:true,reason:'restricted'};
 for(const page of [{url:'https://www.zhihu.com/',answerCount:3},{url:'https://www.zhihu.com/question/123/answer/456',answerCount:0}])assert.throws(()=>assertRecoveryPage(previous,page),/首页登录成功/);
 assertRecoveryPage(previous,{url:'https://www.zhihu.com/question/123/answer/456',answerCount:1});
 assertRecoveryPage({blocked:true,reason:'login-required'},{url:'https://www.zhihu.com/',answerCount:0});
});
test('Zhihu targets keep stable identity and reject external or disguised destinations',()=>{
 assert.deepEqual(zhihuURL('https://www.zhihu.com/question/123/answer/456?utm=x'),{url:'https://www.zhihu.com/question/123/answer/456',questionId:'123',answerId:'456'});
 for(const u of ['https://www.zhihu.com.evil.test/question/123','https://evil.test@www.zhihu.com/question/123','http://www.zhihu.com/question/123','https://www.zhihu.com:8443/question/123','https://www.zhihu.com/messages'])assert.throws(()=>zhihuURL(u));
});
test('old notifications baseline without replying; new notification delivered once',()=>{
 const s={seen:[]},a={key:'a',replyable:true},b={key:'b',replyable:true};assert.deepEqual(newNotifications(s,[a]),[]);assert.deepEqual(newNotifications(s,[a,b]),[b]);assert.deepEqual(newNotifications(s,[b,a]),[]);
});
test('site restriction and login failure pause, uncertain delivery never repeats',()=>{
 assert.equal(accessProblem('您当前请求存在异常，暂时限制本次访问'),'restricted');assert.equal(accessProblem('登录','https://www.zhihu.com/signin'),'login-required');
 for(const status of ['pending','unknown','confirmed'])assert.throws(()=>assertMaySend({x:{status}},'x'));assertMaySend({x:{status:'not-sent'}},'x');
});
test('Zhihu comment and publication quotas persist independently',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhihu-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const b=new SocialBudget({root,today:()=> '2026-11-06'});
 for(let i=0;i<100;i++)b.reserve('zhihu','comment',String(i));assert.throws(()=>b.reserve('zhihu','comment','101'),/100/);assert.equal(b.remaining('xiaohongshu','comment'),100);
 await b.run('zhihu','post','q1',async()=>({confirmed:false,deliveryUncertain:false}));assert.equal(b.remaining('zhihu','post'),1);b.reserve('zhihu','post','q2');assert.equal(new SocialBudget({root,today:()=> '2026-11-06'}).remaining('zhihu','post'),0);
});
test('Zhihu browsing is capped and does not reset another platform usage',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhihu-watch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const opts={root,now:()=>Date.parse('2026-11-06T10:00:00Z'),today:()=> '2026-11-06',maxSeconds:1800};
 beginWatch({...opts,platform:'zhihu'});assert.throws(()=>beginWatch({...opts,platform:'zhihu'}),/30分钟/);assert.throws(()=>beginWatch({...opts,platform:'xiaohongshu'}),/30分钟/);
});
