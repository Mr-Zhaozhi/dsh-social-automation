import test from 'node:test';import assert from 'node:assert/strict';import {searchQuery,normalizeResults,assertSearchAllowed} from '../lib/zhihu-search.mjs';
test('queries are bounded and results reject external links and deduplicate',()=>{assert.equal(searchQuery(' 小说 '),'小说');for(const x of ['', 'a'.repeat(81),'x\ny'])assert.throws(()=>searchQuery(x));const url='https://www.zhihu.com/question/1/answer/2';const rows=normalizeResults([{url,title:'标题',excerpt:'摘要'},{url,title:'重复'},{url:'https://evil.test',title:'广告'}]);assert.equal(rows.length,1);assert.equal(rows[0].complete,false);assert.equal(rows[0].excerpt,'摘要');});
test('comment restriction does not block read-only search; homepage and search limits do',()=>{const c={enabled:true,capabilities:{read:true}};assert.doesNotThrow(()=>assertSearchAllowed(c,{blocked:true,operation:'comment'},{}));for(const [home,search]of [[{blocked:true,operation:'read'},{}],[{},{blocked:true}]])assert.throws(()=>assertSearchAllowed(c,home,search));assert.throws(()=>assertSearchAllowed({enabled:false},{},{}));});
test('unrelated forbidden requests do not classify the entire search as restricted',async()=>{
 const {searchDenial}=await import('../lib/zhihu-search.mjs');
 for(const url of ['https://www.zhihu.com/api/v4/me','https://www.zhihu.com/api/v4/moments','https://www.zhihu.com/question/1/answer/2','https://other.zhihu.com/api/v4/search_v3'])assert.equal(searchDenial({url,status:403,resourceType:'xhr'}),false);
 assert.equal(searchDenial({url:'https://www.zhihu.com/api/v4/search_v3?q=x',status:403,resourceType:'xhr'}),true);
 assert.equal(searchDenial({url:'https://www.zhihu.com/search?q=x',status:403,resourceType:'document',mainFrame:true}),true);
 assert.equal(searchDenial({url:'https://www.zhihu.com/search?q=x',status:200,resourceType:'document',mainFrame:true}),false);
});
