import test from 'node:test';import assert from 'node:assert/strict';
import {nativeBrowserForeground} from '../lib/browser-focus.mjs';
const runFor=id=>async(_file,args)=>({stdout:args[0]==='front'?'ASN:0x0-0x7007:':`"CFBundleIdentifier"="${id}"`});
test('real Edge foreground remains protected',async()=>{
 for(const id of ['com.microsoft.edgemac','com.microsoft.edgemac.Beta'])assert.equal(await nativeBrowserForeground({platform:'darwin',run:runFor(id)}),true);
});
test('another foreground app permits the dedicated background browser',async()=>{
 assert.equal(await nativeBrowserForeground({platform:'darwin',run:runFor('com.openai.codex')}),false);
});
test('missing or ambiguous native state never removes the existing guard',async()=>{
 assert.equal(await nativeBrowserForeground({platform:'darwin',run:async()=>({stdout:''})}),null);
 assert.equal(await nativeBrowserForeground({platform:'darwin',run:async()=>{throw Error('unavailable');}}),null);
 assert.equal(await nativeBrowserForeground({platform:'linux',run:runFor('com.openai.codex')}),null);
});
