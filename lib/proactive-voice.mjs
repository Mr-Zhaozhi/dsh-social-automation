import {execFile} from 'node:child_process';import {promisify} from 'node:util';import fs from 'node:fs';import path from 'node:path';import {workspace} from './runtime.mjs';
const run=promisify(execFile);
export async function prepareVoice(text,mood='normal'){
 if(!['normal','gentle','comfort','sad','playful','happy'].includes(mood))mood='normal';
 const {stdout}=await run('python3',[path.join(workspace,'lib/voice.py'),'--synthesize-only','--mood',mood,text],{cwd:workspace,timeout:90000,maxBuffer:8192});
 const file=fs.realpathSync(stdout.trim().split('\n').at(-1));
 if(!file.startsWith(workspace+path.sep)||!file.endsWith('.wav'))throw Error('合成结果路径无效');
 const bytes=fs.readFileSync(file);if(bytes.length<1000||bytes.length>6e6)throw Error('语音文件大小异常');
 return {type:'record',data:{file:'base64://'+bytes.toString('base64')}};
}
