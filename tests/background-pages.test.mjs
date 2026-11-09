import test from 'node:test';import assert from 'node:assert/strict';import {assertBackgroundUse,backgroundPage,managedPage} from '../lib/browser-pages.mjs';import {browser} from '../lib/runtime.mjs';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
test('background UI yields to Edge and fails closed when front-app identity is unknown',async()=>{
 for(const value of [true,null])await assert.rejects(assertBackgroundUse(async()=>value),e=>e.code==='BROWSER_USER_ACTIVE'&&e.beforeDelivery===true);
 await assert.doesNotReject(assertBackgroundUse(async()=>false));
});
test('background creation, reuse and page input preserve the frontmost app',{skip:process.env.HUOHUO_BROWSER_TESTS!=='1'},async()=>{
 const exec=promisify(execFile),front=async()=>(await exec('/usr/bin/lsappinfo',['front'])).stdout.trim(),b=await browser();let p;
 try{const before=await front();p=await backgroundPage(b.contexts()[0]);await p.evaluate(()=>{window.name='huohuo:focus-regression';document.body.innerHTML='<button>check</button>';});await p.locator('button').click();assert.equal(await managedPage(b.contexts()[0],'focus-regression'),p);assert.equal(await front(),before);}finally{await p?.close();await b.close();}
});
