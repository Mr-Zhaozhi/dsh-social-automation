import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export function editorialHash(m){return crypto.createHash('sha256').update(JSON.stringify(['title','text','description','content_type','date','source_ids','reflection','beats','assets'].map(k=>m[k]??null).concat(m.shot_plan?[m.shot_plan]:[]))).digest('hex');}
export function verifyVideo(file,{title,description,requiredVoiceId}={}){
 const manifest=file.slice(0,-path.extname(file).length)+'.json';
 if(!fs.existsSync(manifest))throw new Error('自动发布缺少视频制作检查记录，请先用 make-video.py 完整制作');
 const m=JSON.parse(fs.readFileSync(manifest));
 if(m.quality_checked!==true||m.ai_generated!==true||!Number.isFinite(m.duration)||m.duration<15||m.duration>90||!Array.isArray(m.beats)||m.beats.length<3||m.beats.join('')!==m.text)throw new Error('视频完整性检查未通过，不发布过短测试片');
 if(![2,3].includes(m.renderer_version)||m.width!==1080||m.height!==1920||m.fps!==30||m.caption_max_chars>12||!Array.isArray(m.timeline)||m.timeline.length!==m.beats.length)throw new Error('缺少新版音画分镜检查记录，请用当前 make-video.py 重制');
 if(m.renderer_version===3&&(!Array.isArray(m.shot_plan)||m.shot_plan.length!==m.beats.length||m.shot_plan.some(s=>!['portrait','wide','detail','card'].includes(s.layout)||typeof s.purpose!=='string'||s.purpose.length<5)))throw new Error('缺少镜头编排');
 let end=0;for(let i=0;i<m.timeline.length;i++){const beat=m.timeline[i];if(!Number.isFinite(beat.start)||!Number.isFinite(beat.end)||Math.abs(beat.start-end)>.01||beat.end<=beat.start||beat.end-beat.start>14||beat.text!==m.beats[i])throw new Error('分镜时间线不完整或单镜头过长');end=beat.end;}
 if(Math.abs(end-m.duration)>.02)throw new Error('音画总时长不一致');
 if(m.video_sha256!==crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'))throw new Error('视频内容与制作检查记录不一致，未上传');
 if(m.editorial?.version!==1||!['diary','discovery','creation','fiction'].includes(m.content_type)||m.editorial.content_sha256!==editorialHash(m))throw new Error('缺少新内容审核或文案已变更，请核对当天素材并重新制作');
 if(m.content_type!=='fiction'&&m.date!==new Date(Date.now()+8*3600000).toISOString().slice(0,10))throw new Error('数字日记素材已跨日，需重新核对日期和表述，不能冒充今天的经历');
 if(typeof m.description!=='string'||!m.description.includes('AI创作')||!Array.isArray(m.editorial.source_ids)||!m.editorial.source_ids.length||typeof m.reflection!=='string'||!m.text.includes(m.reflection))throw new Error('缺少内容来源、个人感受或AI声明');
 if(m.content_type==='fiction'&&(!m.description.includes('虚构')||!m.text.includes('小剧场')))throw new Error('虚构作品缺少明确标注');
 if(title!==undefined&&title!==m.title||description!==undefined&&description!==m.description)throw new Error('发布标题/说明与审核稿不一致，未上传');
 if(requiredVoiceId!==undefined&&(!requiredVoiceId||m.voice_id!==requiredVoiceId))throw new Error('抖音视频必须使用当前小伴本声，请按新音色重新配音制作；不上传旧音色成片');
 return m;
}
