#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';
import {harness,config,sleep,atomicJSON} from './lib/runtime.mjs';
const control=path.join(os.homedir(),'.dsh/douyin-browser/control'),state=path.join(control,'browser.json');
async function ready(){try{const r=await fetch(config.browser_cdp+'/json/version',{signal:AbortSignal.timeout(2000)});return r.ok&&Boolean((await r.json()).webSocketDebuggerUrl);}catch{return false;}}
if(await ready()){console.log('专用浏览器连接正常');process.exit(0);}
if(fs.existsSync(state)){
 const old=JSON.parse(fs.readFileSync(state));let alive=false;
 try{process.kill(old.pid,0);alive=true;}catch{}
 if(alive)throw new Error('浏览器宿主仍在运行但端口无响应，请在 DSH 内关闭专用浏览器后重试；不重复打开资料目录');
 atomicJSON(state,{...old,ready:false,checkedAt:new Date().toISOString()});
}
const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
fs.mkdirSync(control,{recursive:true});const log=fs.openSync(path.join(control,'browser-host.log'),'a');
const port=Number(new URL(config.browser_cdp).port);
const child=spawn(process.execPath,[path.join(pkg,'browser-host.mjs'),path.join(os.homedir(),'.dsh/douyin-browser/cli-profile'),control,String(port)],{detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
for(let i=0;i<30;i++){await sleep(500);if(await ready()){console.log('专用浏览器已启动并验证连接');process.exit(0);}}
throw new Error('浏览器未就绪，详情见 ~/.dsh/douyin-browser/control/browser-host.log');
