import test from 'node:test';import assert from 'node:assert/strict';
import {probeWeb} from '../lib/web-probe.mjs';
test('probe validates HTTP and content, caps search, and never executes scripts',async()=>{
 let searches=0;const web={selectFetchProvider:()=>({id:'http'}),fetchReady:async()=>true,fetch:async()=>({statusCode:200}),selectSearchProvider:()=>({id:'search'}),searchReady:async()=>true,search:async r=>{searches++;assert.equal(r.maxResults,3);return {sources:[{url:'https://www.iana.org/help/example-domains'}]};}};
 const r=await probeWeb(web,()=> 'Example Domain');assert.equal(r.fetch.ok,true);assert.equal(r.search.ok,true);assert.equal(searches,1);
 web.fetch=async()=>({statusCode:403});assert.equal((await probeWeb(web,()=> 'Example Domain')).fetch.ok,false);
 web.fetch=async()=>({statusCode:200});assert.equal((await probeWeb(web,()=> 'blocked')).fetch.ok,false);
});
test('missing credentials/provider never trigger search or expose exception secrets',async()=>{
 const web={selectFetchProvider:()=>{throw Object.assign(Error('secret'),{code:'WEB_PROVIDER_UNAVAILABLE'});},selectSearchProvider:()=>({id:'search'}),searchReady:async()=>false,search:()=>{throw Error('must not search');}};
 const r=await probeWeb(web,()=> '');assert.equal(r.fetch.ok,false);assert.equal(r.fetch.code,'WEB_PROVIDER_UNAVAILABLE');assert.equal(r.search.ready,false);assert(!JSON.stringify(r).includes('secret'));
});
