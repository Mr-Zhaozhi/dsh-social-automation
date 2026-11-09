import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveGithubCLI({home=os.homedir(),env=process.env,executable=p=>{try{fs.accessSync(p,fs.constants.X_OK);return fs.statSync(p).isFile();}catch{return false;}}}={}){
 const candidates=[path.join(home,'.local/bin/gh'),'/opt/homebrew/bin/gh','/usr/local/bin/gh',...(env.PATH||'').split(path.delimiter).filter(Boolean).map(p=>path.join(p,'gh'))];
 const bin=candidates.find(executable);
 if(!bin)throw Object.assign(new Error('未找到可执行的 GitHub CLI；已检查用户安装目录及 PATH，请运行安装检查。'),{code:'GITHUB_CLI_MISSING',beforeDelivery:true});
 return bin;
}
export function githubFailure(error,stderr=''){
 const text=String(stderr),status=Number(text.match(/HTTP\s+(\d{3})/)?.[1]);
 let code='GITHUB_FAILED',message='GitHub 同步请求失败，不能据此判断未安装或未登录';
 if(error.code==='ENOENT'){code='GITHUB_CLI_MISSING';message='GitHub CLI 文件不存在';}
 else if(error.code==='EACCES'){code='GITHUB_CLI_PERMISSION';message='GitHub CLI 没有执行权限';}
 else if(status===409||status===422&&/sha|does not match/i.test(text)){code='GITHUB_CONFLICT';message='共享状态被另一进程更新，需重新读取后提交';}
 else if(status===401||/authentication|auth login|not logged|invalid.*token/i.test(text)){code='GITHUB_AUTH';message='GitHub 身份验证失败，需要检查现有登录';}
 else if(status===403){code='GITHUB_FORBIDDEN';message='GitHub 拒绝访问或已限流，需核对权限与额度';}
 else if(error.killed||error.code==='ETIMEDOUT'||/timed?\s*out|deadline exceeded/i.test(text)){code='GITHUB_TIMEOUT';message='GitHub 请求超时；CLI 已启动，不能判断为未安装';}
 else if(status>=500||/connection|TLS|EOF|resolve host|network|dial tcp/i.test(text)){code='GITHUB_NETWORK';message='GitHub 网络或服务暂时不可用；不能判断为未登录';}
 return Object.assign(new Error(message),{code,beforeDelivery:true,retryable:['GITHUB_CONFLICT','GITHUB_TIMEOUT','GITHUB_NETWORK'].includes(code)});
}
// Re-read remote state before every retry. Never replay an unchecked PUT body.
export async function retryFleetMutation(operation,{attempts=3,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;;attempt++)try{return await operation();}catch(error){if(!error.retryable||attempt+1>=attempts)throw error;await wait(300*(attempt+1));}
}
