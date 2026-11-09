import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';
import{validateCapture,transcribeVideoAudio,videoAudioSummary,recordElementAudio}from'../lib/video-audio.mjs';import{harness}from'../lib/runtime.mjs';
const bytes=Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.alloc(200)]);
const cap=()=>({status:'captured',method:'html-video-audio-track',startSeconds:0,durationSeconds:12,videoDurationSeconds:12,complete:true,mimeType:'audio/webm;codecs=opus',bytes:bytes.length,data:bytes.toString('base64')});
const result=()=>({ok:true,kind:'transcription',backend:'local-whisper',text:'你要的是冰拿铁，这杯根本不是你的。',interval:{startSeconds:0,durationSeconds:12}});
const obs=audio=>({messageId:'fixture-share',media:{type:'shared-work'},sharedWork:{videoId:'123'},videoAudio:{...audio,workId:'123'}});
test('capture validates container, finite range, exact bytes and full-coverage claims',()=>{
 assert.deepEqual(validateCapture(cap()),bytes);
 for(const patch of [{durationSeconds:Infinity},{durationSeconds:121.1},{bytes:1},{mimeType:'text/html'},{data:'xxxx'},{videoDurationSeconds:50},{method:'microphone'},{startSeconds:5}])assert.throws(()=>validateCapture({...cap(),...patch}));
 assert.doesNotThrow(()=>validateCapture({...cap(),complete:false,videoDurationSeconds:200}));
});
test('real-time recorder does not request microphone and unavailable video stays explicit',async()=>{
 assert.equal((await recordElementAudio({duration:NaN})).reason,'video-not-ready');
 const text=recordElementAudio.toString();assert(!text.includes('getUserMedia'));assert(!text.includes('getDisplayMedia'));
});
test('local audio is passed once to ASR, raw bytes are cleaned and short output stays partial',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-asr-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let calls=0;
 const adapter={settings:async()=>({enabled:true,backend:'local-whisper'}),transcribeAudio:async args=>{calls++;assert.deepEqual(fs.readFileSync(args.source),bytes);assert.equal(args.backend,'local-whisper');assert.equal(args.durationSeconds,12);return {...result(),interval:{startSeconds:0,durationSeconds:10}};}};
 const audio=await transcribeVideoAudio(cap(),{root,adapter});assert.equal(audio.status,'transcribed');assert.equal(audio.complete,false);assert.equal(calls,1);assert.deepEqual(fs.readdirSync(path.join(root,'.state/video-audio')),[]);
 assert.match(videoAudioSummary(obs(audio)).text,/冰拿铁/);
});
test('silence, disabled engine, abort and corrupt transcript never become invented dialogue',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-asr-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const adapter={settings:async()=>({enabled:true,backend:'local-whisper'}),transcribeAudio:async()=>({...result(),ok:false,status:'no-speech',text:'',segments:[]})};
 const audio=await transcribeVideoAudio(cap(),{root,adapter});assert.equal(audio.status,'no-recognized-speech');assert.equal(videoAudioSummary(obs(audio)).text,'');
 adapter.settings=async()=>({enabled:false,backend:'local-whisper'});await assert.rejects(transcribeVideoAudio(cap(),{root,adapter}),/未启用/);
 await assert.rejects(transcribeVideoAudio(cap(),{root,adapter,signal:AbortSignal.abort()}));
 assert.deepEqual(fs.readdirSync(path.join(root,'.state/video-audio')),[]);
});
test('cross-video audio, voice-message spoofing and inflated coverage are rejected',()=>{
 const audio={status:'transcribed',text:'fixture',backend:'local-sensevoice',method:'html-video-audio-track',startSeconds:0,durationSeconds:12,videoDurationSeconds:12,complete:true};
 assert.throws(()=>videoAudioSummary({...obs(audio),sharedWork:{videoId:'456'}}));
 assert.throws(()=>videoAudioSummary({...obs(audio),media:{type:'voice'}}));
 assert.throws(()=>videoAudioSummary(obs({...audio,videoDurationSeconds:200})));
 assert.throws(()=>videoAudioSummary(obs({...audio,status:'no-recognized-speech'})));
 assert.equal(videoAudioSummary(obs({status:'unavailable',reason:'not-ready'})).status,'unavailable');
});
test('installed native reply request actually contains video speech alongside frames',{skip:process.env.HUOHUO_NATIVE_TESTS!=='1'},async()=>{
 const{ChatAgent}=await import(pathToFileURL(path.join(harness,'profiles/web/node_modules/dsh-douyin-browser-local/chat-agent.mjs')));
 let request;const agent=new ChatAgent({config:{apiKey:'',model:'fixture'},replyProvider:async r=>{request=r;return {text:'笑点是这杯本来不是他的。'};}});
 const audio={status:'transcribed',text:'你要的什么？冰拿铁。说明这杯根本就不是你的。',backend:'local-sensevoice',method:'html-video-audio-track',startSeconds:0,durationSeconds:12,videoDurationSeconds:12,complete:true};
 const observation={...obs(audio),frames:[{mimeType:'image/jpeg',data:Buffer.from('frame').toString('base64'),videoId:'123',time:2}],understandingScope:'sampled-video-frames-and-audio-transcription'};
 await agent.reply({messages:[{id:'fixture-share',sender:'incoming',text:'笑点是什么',media:{type:'shared-work'}}],mediaObservations:[observation]});
 const parts=request.messages.find(m=>Array.isArray(m.content)).content;
 const evidence=parts.find(p=>p.type==='text'&&p.text.startsWith('{')&&JSON.parse(p.text).videoAudio);
 assert(evidence);assert.match(JSON.parse(evidence.text).videoAudio.text,/根本就不是你的/);assert(!JSON.parse(evidence.text).videoSampling.interpretation.includes('没有音频'));assert.equal(parts.filter(p=>p.type==='image_url').length,1);
 await agent.reply({messages:[{id:'fixture-share',sender:'incoming',text:'声音说了什么',media:{type:'shared-work'}}],mediaObservations:[{...observation,frames:[],understandingScope:'video-audio-transcription'}]});
 const audioOnly=request.messages.find(m=>Array.isArray(m.content)).content;assert(audioOnly.some(p=>p.type==='text'&&p.text.includes('这杯根本就不是你的')));assert.equal(audioOnly.filter(p=>p.type==='image_url').length,0);
});

test('recorder starts playback without waiting for first-data event and cleans tracks',async()=>{
 const{runInNewContext}=await import('node:vm');
 for(const autoRestart of [false,true]){
 let interval,stopped=0,time=0;const listeners=new Map();
 const track={stop(){stopped++;}},stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
 const video={duration:.4,readyState:4,currentSrc:'blob:fixture',loop:true,playbackRate:1,muted:false,ended:false,seeking:false,
  get currentTime(){return time;},set currentTime(v){time=v;this.ended=false;},
  pause(){clearInterval(interval);},play(){this.pause();interval=setInterval(()=>{time=Math.min(.4,time+.1);this.ended=time>=.4;if(this.ended){this.pause();listeners.get('ended')?.();if(autoRestart){time=0;this.ended=false;}}},20);return Promise.resolve();},
  captureStream:()=>stream,addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';/* onstart deliberately requires data/playback */}stop(){this.state='inactive';this.ondataavailable({data:new Blob([bytes])});this.onstop();}}
 class Reader{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:audio/webm;base64,'+Buffer.from(b).toString('base64');this.onload();});}}
 const r=await runInNewContext('('+recordElementAudio.toString()+')(video,{maxSeconds:1,timeoutMs:1500})',{video,MediaRecorder:Recorder,MediaStream:class{},FileReader:Reader,Blob,setTimeout,clearTimeout,setInterval,clearInterval});
 assert.equal(r.status,'captured');assert.equal(r.complete,true);assert.equal(stopped,1);assert.equal(video.loop,true);assert.equal(video.muted,false);assert.equal(r.recordingStartSeconds,0);assert.equal(r.durationSeconds,.4);
 }
});

test('incoming audio reserves bounded viewing time and still shares the daily quota',async t=>{
 const{beginWatch}=await import('../lib/watch-budget.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'audio-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const now=Date.parse('2026-11-08T11:00:00+08:00');const budget=beginWatch({root,now:()=>now,today:()=> '2026-11-08',maxSeconds:900,platform:'douyin-incoming',purpose:'incoming',nativeUsedMs:0,evidence:{platform:'douyin',eventId:'e',peer:'p',kind:'private-share',id:'123'}});
 assert.equal(budget.allowedMs,180000);budget.finish();
});


test('background timer throttling is not mistaken for a seek, but real jumps are rejected',async()=>{
 const{runInNewContext}=await import('node:vm');
 for(const jumps of [false,true]){
  let tick,clock=0,time=0;
  const track={stop(){}},stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
  const video={duration:6,readyState:4,currentSrc:'blob:slow-timer',loop:false,playbackRate:1,muted:true,ended:false,seeking:false,
   get currentTime(){return time;},set currentTime(v){time=v;this.ended=false;},pause(){},
   play(){if(tick)queueMicrotask(()=>{time=3;clock+=jumps?100:3000;tick();time=6;clock+=3000;this.ended=true;tick();});return Promise.resolve();},
   captureStream:()=>stream,addEventListener(){},removeEventListener(){}};
  class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob([bytes])});this.onstop();}}
  class Reader{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:audio/webm;base64,'+Buffer.from(b).toString('base64');this.onload();});}}
  const r=await runInNewContext('('+recordElementAudio.toString()+')(video,{maxSeconds:6,timeoutMs:1500})',{video,MediaRecorder:Recorder,MediaStream:class{},FileReader:Reader,Blob,Date:{now:()=>clock},setTimeout,clearTimeout,setInterval:f=>{tick=f;return 1;},clearInterval(){}});
  assert.equal(r.status,jumps?'unavailable':'captured');if(jumps)assert.equal(r.reason,'video-playback-jumped');
 }
});
