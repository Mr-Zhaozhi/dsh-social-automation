#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {zstdDecompressSync} from 'node:zlib';
import {sharedContext} from './lib/shared-context.mjs';import {workspace,harness} from './lib/runtime.mjs';
const command=process.argv[2]||'status';
if(command==='status')console.log(JSON.stringify(sharedContext.status()));
else if(command==='backfill-owner-qq'){
 // Import only real owner-private session events. Old group sessions can contain
 // WeChat-mirrored traffic and cannot safely be reclassified as public history.
 const owners=sharedContext.bindings().owners?.qq||[],base=path.join(harness,'sessions');let imported=0;
 for(const folder of fs.readdirSync(base))for(const id of fs.readdirSync(path.join(base,folder))){
  if(!owners.some(owner=>id===`onebot-private-${owner}`||id.startsWith(`onebot-private-${owner}-`)))continue;
  const file=path.join(base,folder,id,'session.v4.jsonl.zstd');if(!fs.existsSync(file))continue;
  const buffer=fs.readFileSync(file);let offset=0,session;
  while(offset<buffer.length){const result=zstdDecompressSync(buffer.subarray(offset),{info:true});if(!result.engine.bytesWritten)throw new Error('会话压缩帧未前进');offset+=result.engine.bytesWritten;
   for(const line of result.buffer.toString().split('\n').filter(Boolean)){
    const event=JSON.parse(line);if(event.type==='session'){session={id:event.id,header:{cwd:event.cwd}};if(path.resolve(event.cwd)!==workspace){offset=buffer.length;break;}}
    else if(session&&sharedContext.observe(session,event))imported++;
   }
  }
 }
 sharedContext.prune();console.log(JSON.stringify({imported,...sharedContext.status()}));
}else throw new Error('支持 status / backfill-owner-qq');
