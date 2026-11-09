import test from 'node:test';import assert from 'node:assert/strict';
import {newsAwake,listDue,selectNews,usableArticle} from '../lib/news-policy.mjs';
import {discoveryDue} from '../lib/life-state.mjs';
const now=Date.parse('2026-11-09T12:00:00+08:00');
test('cheap lists independent of spent deep-read budget, two-hour cache and quiet hours',()=>{
 assert(listDue({checkedAt:now-7200000},now));assert(!listDue({checkedAt:now-1000},now));
 assert(!newsAwake(Date.parse('2026-11-09T23:30:00+08:00')));assert(newsAwake(Date.parse('2026-11-09T23:29:00+08:00')));
 const attempts=Array.from({length:4},(_,i)=>({date:'2026-11-09',at:now-36000000+i}));assert(!discoveryDue({attempts},now));assert(listDue({},now));
});
test('interest selection skips read topics and recent failures; no forced filler',()=>{
 const a={title:'AI 新发现',url:'a'},b={title:'游戏更新',url:'b'};
 assert.equal(selectNews([a,b],[{url:'article',originUrl:'a'}],{},now),b);
 assert.equal(selectNews([a],[],{a:now-1000},now),undefined);
 assert.equal(selectNews([{title:'随机营销',url:'x'}],[],{},now),undefined);
 assert(!usableArticle({scope:'headline-only',text:'a'.repeat(200)}));assert(usableArticle({scope:'rss-content',text:'a'.repeat(200)}));
});
