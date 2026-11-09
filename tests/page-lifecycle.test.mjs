import test from 'node:test';import assert from 'node:assert/strict';
import {abandonedTemporary,protectedPage,releasePage,recoverTemporaryPages} from '../lib/page-lifecycle.mjs';
const page=(name,{url='https://www.zhihu.com/',dirty=false}={})=>({closed:false,isClosed(){return this.closed},url:()=>url,evaluate:async()=>({name,dirty}),async close(){this.closed=true}});
test('only dead-process temporary owners are reclaimed',()=>{assert.equal(abandonedTemporary('huohuo:temporary:123:456',()=>false),true);for(const n of ['huohuo:temporary:123:456','huohuo:xhs-browse','deepseek-douyin-api-chat',''])assert.equal(abandonedTemporary(n,()=>true),false);});
test('drafts, creator pages, and chat tabs survive release',async()=>{for(const p of [page('huohuo:xhs-browse',{dirty:true}),page('huohuo:temporary:1:1',{url:'https://creator.douyin.com/creator-micro/content/upload'}),page('huohuo:xhs-inbox')]){assert.equal(await releasePage(p),false);assert.equal(p.closed,false);}const p=page('huohuo:zhihu-browse');assert.equal(await releasePage(p),true);});
test('unreadable pages and native watcher are not swept',async()=>{const p=page('deepseek-douyin-api-watch');const bad=page('');bad.evaluate=async()=>{throw Error('unresponsive')};assert.equal(await recoverTemporaryPages({pages:()=>[p,bad]}),0);assert.equal(p.closed,false);assert.equal(protectedPage('https://creator.xiaohongshu.com/new/note-manager'),true);});
test('recovery closes abandoned owned reading pages but keeps live and dirty ones',async()=>{
 const stale=page('huohuo:zhihu-browse:2147483647:1'),live=page(`huohuo:temporary:${process.pid}:1`),dirty=page('huohuo:temporary:2147483647:1',{dirty:true});
 assert.equal(await recoverTemporaryPages({pages:()=>[stale,live,dirty]}),1);assert.equal(stale.closed,true);assert.equal(live.closed,false);assert.equal(dirty.closed,false);
});
