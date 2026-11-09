import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
export const workspace=process.env.HUOHUO_WORKSPACE || path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const harness=process.env.DSH_HOME || path.join(os.homedir(),'Library/Application Support/dsh-desktop/harness');
export const config=JSON.parse(fs.readFileSync(path.join(workspace,'automation.json'),'utf8'));
export function isMainModule(url,entry=process.argv[1]){
  if(!entry)return false;
  try{return fs.realpathSync(entry)===fs.realpathSync(fileURLToPath(url));}catch{return false;}
}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function playwright(){
  for(const root of [path.join(workspace,'package.json'),path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/package.json')]){
    try{return createRequire(fs.realpathSync(root))('playwright');}catch{}
  }
  throw new Error('缺少 Playwright：请运行 ./setup.sh 或安装抖音插件');
}
// Preserve native visibility/focus. Playwright defaults otherwise make every tab
// appear focused, which leaves the background private-message listener waiting.
export async function browser(){return playwright().chromium.connectOverCDP(config.browser_cdp,{timeout:30000,noDefaults:true});}
export function atomicJSON(p,value){fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,p);}
export function day(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function lock(name){
  const dir=path.join(workspace,'.state',name+'.lock');fs.mkdirSync(path.dirname(dir),{recursive:true});
  try{fs.mkdirSync(dir);}
  catch{
    let pid;try{pid=JSON.parse(fs.readFileSync(path.join(dir,'owner.json'))).pid;}catch{throw Object.assign(new Error('锁初始化中，请稍后重试'),{code:'LOCK_BUSY'});}
    let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)throw Object.assign(new Error('已有浏览器操作在执行，请勿并发'),{code:'LOCK_BUSY'});
    const stale=dir+'.stale-'+process.pid;fs.renameSync(dir,stale);fs.rmSync(stale,{recursive:true});fs.mkdirSync(dir);
  }
  fs.writeFileSync(path.join(dir,'owner.json'),JSON.stringify({pid:process.pid}));
  return ()=>{try{if(JSON.parse(fs.readFileSync(path.join(dir,'owner.json'))).pid===process.pid)fs.rmSync(dir,{recursive:true});}catch{}};
}

// Wait before any browser action; never retry a dispatched send.
export async function waitForLock(name,{timeoutMs=30000,pollMs=250}={}){
  const deadline=Date.now()+timeoutMs;
  for(;;){
    try{return lock(name);}
    catch(error){
      if(error.code!=='LOCK_BUSY'||Date.now()>=deadline)throw error;
      await sleep(Math.min(pollMs,Math.max(1,deadline-Date.now())));
    }
  }
}
