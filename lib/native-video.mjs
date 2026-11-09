import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {harness} from './runtime.mjs';
import {advanceVideo} from './video-progress.mjs';
export async function nativeVideoSession(){
 const pkg=fs.realpathSync(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local'));
 const {BrowserController}=await import(pathToFileURL(path.join(pkg,'core.mjs')));
 // Use the native source and native shared clocks/locks. Never use verification mode.
 const controller=new BrowserController({source:'api'});
 return {async next(expectedId){const signal=AbortSignal.timeout(45000);return advanceVideo((tool,args,options)=>controller.execute(tool,args,{...options,signal}),expectedId);},close:()=>controller.close()};
}
