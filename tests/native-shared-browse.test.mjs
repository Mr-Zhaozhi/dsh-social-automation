import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {harness,day} from '../lib/runtime.mjs';
test('installed native playback enforces shared remaining time while chat remains allowed',{skip:process.env.HUOHUO_NATIVE_TESTS!=='1'},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-shared-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const date=day();
 fs.mkdirSync(path.join(root,'.state/watch-time'),{recursive:true});fs.writeFileSync(path.join(root,'automation.json'),'{}');
 fs.writeFileSync(path.join(root,'.state/social-plan.json'),JSON.stringify({date,status:'ready',plan:{policyVersion:2,browsePlatform:'douyin',browseMinute:480}}));
 fs.writeFileSync(path.join(root,'.state/watch-time/xiaohongshu.json'),JSON.stringify({version:1,entries:[{date,ms:900000,status:'settled'}]}));
 const file=path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/video-limits.mjs');
 const script=`import {pathToFileURL} from 'node:url';import fs from 'node:fs';import path from 'node:path';
 const date=${JSON.stringify(date)},now=Date.parse(date+'T12:00:00+08:00');Date.now=()=>now;
 const {VideoLimits}=await import(pathToFileURL(${JSON.stringify(file)}));const limits=new VideoLimits({stateDir:path.join(process.env.HUOHUO_WORKSPACE,'native'),now:()=>now});
 limits.savePolicy({enabled:true,windows:['08:00-23:59'],dailyMinutes:30},{explicit:true});
 fs.writeFileSync(limits.usageFile,JSON.stringify({version:1,days:{[date]:600},active:null}));const first=limits.state();
 fs.writeFileSync(limits.usageFile,JSON.stringify({version:1,days:{[date]:900},active:null}));const exhausted=limits.state();
 console.log(JSON.stringify({allowed:first.allowed,remaining:first.remainingSeconds,exhausted:exhausted.allowed,reason:exhausted.reasonCode,chat:limits.beforeAction('api','douyin_chat_read').allowed}));`;
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,HUOHUO_WORKSPACE:root},encoding:'utf8'}));
 assert.deepEqual(result,{allowed:true,remaining:300,exhausted:false,reason:'shared-browse',chat:true});
});
