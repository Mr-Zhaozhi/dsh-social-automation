import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {browser,harness,workspace,lock,atomicJSON,day} from './lib/runtime.mjs';
const args=process.argv.slice(2);const opt=k=>args[args.indexOf('--'+k)+1];
const expected=args.includes('--video')?opt('video'):'';const text=args.includes('--text')?opt('text'):'';
if(!args.includes('--confirm')||!/^\d{1,64}$/.test(expected)||!text||text.length>200)throw new Error('需要 --video 作品编号 --text 评论正文 --confirm');
const ledgerFile=path.join(workspace,'.state/manual-comments.json');
const read=()=>fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile)):[];
if(read().some(x=>x.video===expected)||read().filter(x=>x.day===day()).length>=3)throw new Error('已有此作品的评论记录或达到手动验证额度');
const release=lock('browser-actions');let b;
try{
 const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
 const {CommentBrowser}=await import(pathToFileURL(path.join(pkg,'comment-browser.mjs')));
 const {readPageState}=await import(pathToFileURL(path.join(pkg,'core.mjs')));
 b=await browser();const p=b.contexts()[0].pages().find(p=>new URL(p.url()).pathname==='/video/'+expected);
 if(!p)throw new Error('先在专用浏览器打开指定作品');
 const state=await p.evaluate(readPageState);if(state.video?.id!==expected||state.privateChatVisible||state.loginRequired||state.verificationRequired)throw new Error('作品、登录或页面状态不满足评论条件');
 let clicked=false;const before={day:day(),video:expected,text,status:'preparing'};
 const authorize=async ({videoId,phase})=>{
   if(videoId!==expected)throw new Error('评论目标变化');
   if(phase==='before-click'){if(clicked)throw new Error('禁止二次发送');clicked=true;const rows=read();rows.push({...before,status:'pending'});atomicJSON(ledgerFile,rows);}return true;
 };
 authorize.beginDispatch=()=>{if(!clicked)throw new Error('没有一次有效点击许可');return()=>{};};
 const commenter=new CommentBrowser({source:'dsh',controller:{withPage:async fn=>fn(p)},stateDir:path.join(pkg,'state')});
 const result=await commenter.post({expectedVideoId:expected,text},{authorize,signal:AbortSignal.timeout(45000)});
 if(clicked){const rows=read(),row=rows.find(x=>x.video===expected);Object.assign(row,{status:result.confirmed?'confirmed':'unknown',result});atomicJSON(ledgerFile,rows);}
 console.log(JSON.stringify(result));if(!result.confirmed)process.exitCode=1;
}finally{await b?.close();release();}
