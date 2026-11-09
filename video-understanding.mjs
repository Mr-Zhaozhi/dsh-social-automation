import fs from'node:fs';import path from'node:path';import{videoModelStatus}from'./lib/video-understanding.mjs';import{workspace}from'./lib/runtime.mjs';
if(process.argv[2]!=='status')throw Error('用法：./node-run.sh video-understanding.mjs status');
let budget={calls:0};try{budget=JSON.parse(fs.readFileSync(path.join(workspace,'.state/video-understanding/budget.json')));}catch{}
console.log(JSON.stringify({...videoModelStatus(),budget},null,2));
