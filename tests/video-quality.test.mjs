import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {verifyVideo,editorialHash} from '../lib/video-quality.mjs';
test('publication rejects unchecked, short, and altered video files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-quality-')),file=path.join(dir,'story.mp4'),manifest=path.join(dir,'story.json');
 try{fs.writeFileSync(file,'fixture');assert.throws(()=>verifyVideo(file),/检查记录/);
 const m={quality_checked:true,ai_generated:true,duration:7,beats:['开头','发展','结尾'],text:'开头发展结尾',video_sha256:crypto.createHash('sha256').update('fixture').digest('hex')};
 fs.writeFileSync(manifest,JSON.stringify(m));assert.throws(()=>verifyVideo(file),/过短/);m.duration=20;m.renderer_version=2;m.width=1080;m.height=1920;m.fps=30;m.caption_max_chars=12;m.timeline=[{start:0,end:6,text:'开头'},{start:6,end:12,text:'发展'},{start:12,end:20,text:'结尾'}];fs.writeFileSync(manifest,JSON.stringify(m));assert.throws(()=>verifyVideo(file),/内容审核/);
 Object.assign(m,{title:'今天的小事',description:'今天的具体观察 #AI创作',content_type:'diary',reflection:'发展',source_ids:['test'],date:new Date(Date.now()+8*3600000).toISOString().slice(0,10)});m.editorial={version:1,source_ids:['test'],content_sha256:editorialHash(m)};fs.writeFileSync(manifest,JSON.stringify(m));assert.equal(verifyVideo(file,{title:m.title,description:m.description}).duration,20);
 assert.throws(()=>verifyVideo(file,{requiredVoiceId:'test-self'}),/本声/);
 m.voice_id='test-jinx';fs.writeFileSync(manifest,JSON.stringify(m));assert.throws(()=>verifyVideo(file,{requiredVoiceId:'test-self'}),/本声/);
 m.voice_id='test-self';fs.writeFileSync(manifest,JSON.stringify(m));assert.equal(verifyVideo(file,{requiredVoiceId:'test-self'}).voice_id,'test-self');assert.throws(()=>verifyVideo(file,{requiredVoiceId:''}),/本声/);
 const date=m.date;m.date='2001-01-01';m.editorial.content_sha256=editorialHash(m);fs.writeFileSync(manifest,JSON.stringify(m));assert.throws(()=>verifyVideo(file),/跨日/);m.date=date;m.editorial.content_sha256=editorialHash(m);fs.writeFileSync(manifest,JSON.stringify(m));
 assert.throws(()=>verifyVideo(file,{title:'随手改了标题'}),/审核稿不一致/);
 m.description='今日营业中 #AI创作';fs.writeFileSync(manifest,JSON.stringify(m));assert.throws(()=>verifyVideo(file),/文案已变更/);m.description='今天的具体观察 #AI创作';fs.writeFileSync(manifest,JSON.stringify(m));
 fs.writeFileSync(file,'modified');assert.throws(()=>verifyVideo(file),/不一致/);
 }finally{fs.rmSync(dir,{recursive:true});}
});
