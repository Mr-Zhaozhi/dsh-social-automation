import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {atomicJSON} from './runtime.mjs';
const exec=promisify(execFile);
export const controlFile=path.join(os.homedir(),'.dsh/douyin-browser/control/browser.json');
export const readHost=()=>JSON.parse(fs.readFileSync(controlFile,'utf8'));
export function sameHost(a,b){return a?.pid===b?.pid&&a?.port===b?.port&&a?.profile===b?.profile;}
export function eligibleHost(s,profile=path.join(os.homedir(),'.dsh/douyin-browser/cli-profile')){
 return Number.isSafeInteger(s?.pid)&&s.pid>1&&s.port===9227&&s.profile===profile&&(s.launchFailure?.code==='EDGE_FOCUS_RESET_FAILED'||s.recoveryGuard?.kind==='huohuo-native-focus');
}
export function verifyOwner(s,{hostCommand,listenerPid,listenerParent,listenerCommand}){
 if(!hostCommand.includes('/browser-host.mjs ')||!hostCommand.includes(s.profile)||!hostCommand.endsWith(' '+s.port)||!Number.isSafeInteger(listenerPid)||listenerParent!==s.pid||!listenerCommand.includes('/Microsoft Edge ')||!listenerCommand.includes('--user-data-dir='+s.profile)||!listenerCommand.includes('--remote-debugging-port='+s.port))throw Error('专用浏览器进程归属未通过，未接管');
 return true;
}
export async function checkOwner(s){
 const command=async(pid,field)=>(await exec('/bin/ps',['-p',String(pid),'-o',field+'='],{timeout:3000})).stdout.trim();
 const listeners=(await exec('/usr/sbin/lsof',['-nP','-iTCP:'+s.port,'-sTCP:LISTEN','-t'],{timeout:3000})).stdout.trim().split(/\s+/).map(Number);
 if(listeners.length!==1)throw Error('专用端口监听者不唯一');
 return verifyOwner(s,{hostCommand:await command(s.pid,'command'),listenerPid:listeners[0],listenerParent:Number(await command(listeners[0],'ppid')),listenerCommand:await command(listeners[0],'command')});
}
export function writeRecovery(s,ready,error){
 const current=readHost();if(!sameHost(s,current))throw Error('浏览器宿主已变化，未覆盖状态');
 const next={...current,ready,recoveryGuard:{kind:'huohuo-native-focus',pid:process.pid,at:Date.now()}};
 if(ready)delete next.launchFailure;
 else next.launchFailure={code:'EDGE_FOCUS_RESET_FAILED',message:String(error?.message||error||'恢复守护已停止').slice(0,200),at:Date.now()};
 atomicJSON(controlFile,next);
}
