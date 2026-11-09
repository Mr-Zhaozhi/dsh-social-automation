import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {workspace,atomicJSON,day,waitForLock,isMainModule} from './runtime.mjs';
import {resolveGithubCLI,githubFailure,retryFleetMutation} from './github-cli.mjs';
const exec=promisify(execFile),configFile=path.join(workspace,'sync.json'),cacheFile=path.join(workspace,'.state/fleet-cache.json');
const read=(p,d)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):d;
export function fleetConfig(){return read(configFile,{enabled:false});}
export function identity(){const f=path.join(workspace,'.state/fleet-id.json');if(!fs.existsSync(f))atomicJSON(f,{id:randomUUID()});return read(f,{}).id;}
export function canOwn(state,id,now=Date.now()){return !state.owner||state.owner===id||Number(state.until)<=now;}
export function canSend(state,id,now=Date.now()){return state.owner===id&&Number(state.until)>now+90000;}
export async function githubEnvironment(){const env={...process.env};if(process.platform==='darwin'&&!env.HTTPS_PROXY&&!env.https_proxy){try{const {stdout}=await exec('/usr/sbin/scutil',['--proxy']);if(/HTTPSEnable\s*:\s*1\b/.test(stdout)){const host=stdout.match(/HTTPSProxy\s*:\s*([\w.-]+)/)?.[1],port=stdout.match(/HTTPSPort\s*:\s*(\d+)/)?.[1];if(host&&port)env.HTTPS_PROXY=`http://${host}:${port}`;}}catch{}}return env;}
export async function gh(args,input){
 const bin=resolveGithubCLI(),env=await githubEnvironment();
 return new Promise((resolve,reject)=>{
  const p=execFile(bin,args,{cwd:workspace,env,timeout:25000,maxBuffer:2*1024*1024},(err,out,stderr)=>err?reject(githubFailure(err,stderr)):resolve(out));
  // EPIPE follows an early CLI exit; the callback reports the classified failure.
  p.stdin.on('error',()=>{});p.stdin.end(input);
 });
}
async function remote(){const c=fleetConfig(),r=JSON.parse(await gh(['api',`repos/${c.repository}/contents/runtime/fleet.json?ref=runtime`]));return {sha:r.sha,state:JSON.parse(Buffer.from(r.content,'base64'))};}
async function save(sha,state){const c=fleetConfig();await gh(['api',`repos/${c.repository}/contents/runtime/fleet.json`,'--method','PUT','--input','-'],JSON.stringify({message:'Update active automation lease',branch:'runtime',sha,content:Buffer.from(JSON.stringify(state)).toString('base64')}));atomicJSON(cacheFile,{...state,checkedAt:Date.now()});}
export async function assertRunner(){
 if(!fleetConfig().enabled)return;
 const id=identity(),cached=read(cacheFile,{});if(Date.now()-cached.checkedAt<45000&&canSend(cached,id))return;
 const {state}=await remote();atomicJSON(cacheFile,{...state,checkedAt:Date.now()});if(!canSend(state,id))throw Object.assign(new Error('另一台电脑正在执行，或共享运行凭证已过期；本机等待接班'),{beforeDelivery:true,code:'FLEET_STANDBY'});
}
export async function heartbeat(){
 if(!fleetConfig().enabled)return {status:'local'};const release=await waitForLock('fleet');
 try{const r=await remote(),id=identity();if(!canOwn(r.state,id)){atomicJSON(cacheFile,{...r.state,checkedAt:Date.now()});return {status:'standby'};}
 r.state.owner=id;r.state.until=Date.now()+300000;r.state.updatedAt=new Date().toISOString();await save(r.sha,r.state);return {status:'active'};
 }finally{release();}
}
export function mergeDailyBudgets(remoteBudgets,localBudgets,date){
 const merged=structuredClone(remoteBudgets||{});
 for(const [key,entries] of Object.entries(localBudgets)){
  if(!key.startsWith(date+':'))continue;
  const list=merged[key]||=[];
  for(const e of entries){if(!e.id||!Number.isInteger(e.units)||e.units<1)throw new Error('历史预算记录无效');const old=list.find(x=>x.id===e.id);if(old)old.units=Math.max(old.units,e.units);else list.push({id:e.id,units:e.units});}
 }
 return merged;
}
export async function syncExistingBudgets(){
 await assertRunner();if(!fleetConfig().enabled)return;
 const local={};for(const platform of ['douyin','xiaohongshu','zhihu'])for(const kind of ['private','comment','post']){
  const f=path.join(workspace,`.state/social-budget/${platform}-${kind}.json`);
  if(fs.existsSync(f))local[`${day()}:${platform}:${kind}`]=read(f,{}).entries.filter(e=>e.date===day()&&e.status!=='not-sent').map(e=>({id:e.id,units:e.units||1}));
 }
 const release=await waitForLock('fleet');try{const r=await remote();if(!canSend(r.state,identity()))throw new Error('运行凭证已变化');r.state.budgets=mergeDailyBudgets(r.state.budgets,local,day());await save(r.sha,r.state);}finally{release();}
}
export async function assertWatcher(platform){
 if(!fleetConfig().enabled)return;await assertRunner();const id=identity(),key=day()+':all-browse',cached=read(cacheFile,{});if(cached.watchOwners?.[key]===id&&canSend(cached,id))return;
 const release=await waitForLock('fleet');try{const r=await remote();if(!canSend(r.state,id))throw new Error('运行凭证已变化');r.state.watchOwners||={};if(Object.entries(r.state.watchOwners).some(([k,owner])=>k.startsWith(day()+':')&&owner!==id))throw new Error('今天所有平台的共享浏览由另一台电脑计时；本机次日再刷，避免重复计算30分钟');r.state.watchOwners[key]=id;for(const k of Object.keys(r.state.watchOwners))if(!k.startsWith(day()+':'))delete r.state.watchOwners[k];await save(r.sha,r.state);}finally{release();}
}
// CAS stores shared daily reservations, so switching computers never resets quotas.
export async function globalBudget(platform,kind,units,operationId,releaseReservation=false){
 if(!fleetConfig().enabled)return;
 await assertRunner();const release=await waitForLock('fleet');
 try{return await retryFleetMutation(async()=>{const r=await remote();if(!canSend(r.state,identity()))throw Object.assign(new Error('运行电脑已切换'),{beforeDelivery:true});r.state.budgets||={};
  for(const k of Object.keys(r.state.budgets))if(!k.startsWith(day()+':'))delete r.state.budgets[k];
  const key=`${day()}:${platform}:${kind}`,list=r.state.budgets[key]||=[];
  if(releaseReservation){r.state.budgets[key]=list.filter(e=>e.id!==operationId);}
  else if(list.some(e=>e.id===operationId))return;
  else{const cap={private:15,comment:100,post:1}[kind];if(list.reduce((n,e)=>n+e.units,0)+units>cap)throw Object.assign(new Error('两台电脑共用的今日互动额度已满'),{beforeDelivery:true});list.push({id:operationId,units});}
  await save(r.sha,r.state);
 });}finally{release();}
}
if(isMainModule(import.meta.url)){try{if(process.argv[2]==='diagnose'){const bin=resolveGithubCLI();if(!fleetConfig().enabled)console.log(JSON.stringify({cli:bin,coordination:'disabled'}));else{const {state}=await remote();console.log(JSON.stringify({cli:bin,remoteReachable:true,leaseValid:canSend(state,identity())}));}}else if(process.argv[2]==='heartbeat')console.log(JSON.stringify(await heartbeat()));else{await assertRunner();console.log('active');}}catch(e){console.error(process.argv.includes('--json')?JSON.stringify({code:e.code||'FLEET_CHECK_FAILED',message:e.message,retryable:e.retryable===true,beforeDelivery:true}):e.message);process.exitCode=1;}}
