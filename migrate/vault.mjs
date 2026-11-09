import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {workspace,atomicJSON,isMainModule} from '../lib/runtime.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function seal(data,key,aad='huohuo-v1') {const nonce=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from(aad));return Buffer.concat([nonce,c.update(data),c.final(),c.getAuthTag()]);}
export function unseal(blob,key,aad='huohuo-v1'){if(blob.length<28)throw new Error('密文过短');const d=crypto.createDecipheriv('aes-256-gcm',key,blob.subarray(0,12));d.setAAD(Buffer.from(aad));d.setAuthTag(blob.subarray(-16));return Buffer.concat([d.update(blob.subarray(12,-16)),d.final()]);}
export function safeRelative(name){return typeof name==='string'&&!path.isAbsolute(name)&&!name.split(/[\\/]/).some(p=>p==='..'||!p);}
function key(create=false){const f=path.join(os.homedir(),'.dsh/secrets/sync.key');if(!fs.existsSync(f)&&create){fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});fs.writeFileSync(f,crypto.randomBytes(32),{mode:0o600});}const k=fs.readFileSync(f);if(k.length!==32)throw new Error('同步密钥必须为32字节');return k;}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);}
export function exportVault(){
 const k=key(true),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-vault-')),dest=path.join(workspace,'vault');fs.mkdirSync(dest,{recursive:true});
 try{
  execFileSync('python3',[path.join(workspace,'migrate/kit.py'),'export','--out',path.join(tmp,'kit.tar.gz')],{stdio:'pipe',maxBuffer:1024*1024});
  execFileSync('tar',['-xzf',path.join(tmp,'kit.tar.gz'),'-C',tmp]);const root=path.join(tmp,'huohuo-kit'),old=fs.existsSync(path.join(dest,'index.json'))?JSON.parse(fs.readFileSync(path.join(dest,'index.json'))):{},index={version:1,files:{}};
  for(const f of walk(root)){const rel=path.relative(root,f),name=hash(rel)+'.bin',data=fs.readFileSync(f),sha=hash(data);index.files[name]={path:rel,sha,mode:fs.statSync(f).mode&0o777};if(old.files?.[name]?.sha!==sha||!fs.existsSync(path.join(dest,name)))fs.writeFileSync(path.join(dest,name),seal(data,k,name),{mode:0o600});}
  atomicJSON(path.join(dest,'index.json'),index);for(const f of fs.readdirSync(dest))if(f.endsWith('.bin')&&!index.files[f])fs.unlinkSync(path.join(dest,f));
  console.log(JSON.stringify({encryptedFiles:Object.keys(index.files).length,keyPath:'~/.dsh/secrets/sync.key'}));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
export function restoreVault({dry=false,targetHome=os.homedir()}={}){
 const k=key(),src=path.join(workspace,'vault'),index=JSON.parse(fs.readFileSync(path.join(src,'index.json'))),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-restore-'));
 try{if(index.version!==1)throw new Error('不支持的加密备份版本');for(const [name,m] of Object.entries(index.files)){if(!/^[a-f0-9]{64}\.bin$/.test(name)||!safeRelative(m.path))throw new Error('备份路径不合法');const data=unseal(fs.readFileSync(path.join(src,name)),k,name);if(hash(data)!==m.sha)throw new Error('备份摘要校验失败');const dst=path.join(tmp,m.path);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,data,{mode:m.mode&0o111?0o700:0o600});}
 execFileSync('python3',[path.join(workspace,'migrate/kit.py'),'restore','--kit',tmp,'--target-home',targetHome,...(dry?['--dry-run']:[])],{stdio:'inherit'});
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
if(isMainModule(import.meta.url)){const cmd=process.argv[2];if(cmd==='export')exportVault();else if(cmd==='restore')restoreVault({dry:process.argv.includes('--dry-run'),targetHome:process.argv.includes('--target-home')?process.argv[process.argv.indexOf('--target-home')+1]:os.homedir()});else throw new Error('用法 vault.mjs export|restore [--dry-run]');}
