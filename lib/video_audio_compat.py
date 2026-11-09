# -*- coding: utf-8 -*-
"""Connect actual video audio evidence to native private replies without voice-message spoofing."""
import json
from runtime import HARNESS,WORKSPACE

def apply_video_audio():
 from compat import patch_file
 pkg=(HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local').resolve()
 if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('视频音轨适配需要复核插件版本')
 service=pkg/'chat-service.mjs';agent=pkg/'chat-agent.mjs'
 media=(WORKSPACE/'lib/incoming-media.mjs').as_uri()
 patch_file(service,json.dumps(media+'?v=4'),json.dumps(media+'?v=5')+' /* HUOHUO_VIDEO_AUDIO_V5 */','HUOHUO_VIDEO_AUDIO_V5')
 patch_file(service,'understandingScope:observed.understandingScope,note:observed.note,','understandingScope:observed.understandingScope,note:observed.note,videoAudio:observed.videoAudio, // HUOHUO_VIDEO_AUDIO_HANDOFF','HUOHUO_VIDEO_AUDIO_HANDOFF')
 text=agent.read_text()
 patch_file(agent,text,'import {videoAudioSummary} from '+json.dumps((WORKSPACE/'lib/video-audio.mjs').as_uri())+'; // HUOHUO_VIDEO_AUDIO_IMPORT\n'+text,'HUOHUO_VIDEO_AUDIO_IMPORT')
 patch_file(agent,"  if (shared || observation.media?.type === 'shared-work') {", "  const videoAudio=videoAudioSummary(observation);if(videoAudio)summary.videoAudio=videoAudio; // HUOHUO_VIDEO_AUDIO_SUMMARY\n  if (shared || observation.media?.type === 'shared-work') {",'HUOHUO_VIDEO_AUDIO_SUMMARY')
 patch_file(agent,"interpretation: '只是分时画面采样，没有音频，", "interpretation: (videoAudio?.status==='transcribed'?'画面是分时采样；声音另见videoAudio本地转写，':'只是分时画面采样，本次无可用对白转写，')+ /* HUOHUO_VIDEO_AUDIO_SCOPE */ '",'HUOHUO_VIDEO_AUDIO_SCOPE')
 patch_file(service,'videoAudio:observed.videoAudio, // HUOHUO_VIDEO_AUDIO_HANDOFF','videoAudio:observed.videoAudio,media:message.media, // HUOHUO_VIDEO_AUDIO_BOUND_TYPE','HUOHUO_VIDEO_AUDIO_BOUND_TYPE')
 policy=(WORKSPACE/'lib/inbox-policy.mjs').as_uri()
 passive=(WORKSPACE/'lib/passive-inbox.mjs').as_uri()
 patch_file(service,json.dumps(policy+'?v=2'),json.dumps(policy+'?v=3')+' /* HUOHUO_AUDIO_POLICY_V3 */','HUOHUO_AUDIO_POLICY_V3')
 patch_file(service,json.dumps(passive),json.dumps(passive+'?v=2')+' /* HUOHUO_AUDIO_PASSIVE_V2 */','HUOHUO_AUDIO_PASSIVE_V2')
 patch_file(service,json.dumps(media+'?v=5'),json.dumps(media+'?v=6')+' /* HUOHUO_VIDEO_AUDIO_READY_V6 */','HUOHUO_VIDEO_AUDIO_READY_V6')
 patch_file(service,'try { captured=await this.browser.captureMessage(id,messageId,{allowed:true,signal}); }',"try { captured=includeWork&&!onVideoObservation&&message.media.type==='shared-work'?{messageId,media:message.media,frames:[]}:await this.browser.captureMessage(id,messageId,{allowed:true,signal}); } // HUOHUO_VIDEO_SKIP_COVER",'HUOHUO_VIDEO_SKIP_COVER')
 patch_file(service,json.dumps(media+'?v=6'),json.dumps(media+'?v=7')+' /* HUOHUO_VIDEO_AUDIO_READY_V7 */','HUOHUO_VIDEO_AUDIO_READY_V7')
 patch_file(service,json.dumps(media+'?v=7'),json.dumps(media+'?v=8')+' /* HUOHUO_VIDEO_AUDIO_READY_V8 */','HUOHUO_VIDEO_AUDIO_READY_V8')
 # Repair older handoff markers that accidentally swallowed the media binding in a line comment.
 text=service.read_text()
 if 'HUOHUO_VIDEO_AUDIO_BOUND_TYPE_V2' not in text:
  import re
  lines=re.findall(r'videoAudio:observed\.videoAudio,[^\n]*HUOHUO_VIDEO_AUDIO_BOUND_TYPE[^\n]*',text)
  if len(lines)!=1:raise RuntimeError('视频音轨绑定结构变化，未修改')
  patch_file(service,lines[0],'videoAudio:observed.videoAudio,media:message.media, /* HUOHUO_VIDEO_AUDIO_BOUND_TYPE_V2 */','HUOHUO_VIDEO_AUDIO_BOUND_TYPE_V2')
 patch_file(service,json.dumps(media+'?v=8'),json.dumps(media+'?v=9')+' /* HUOHUO_VIDEO_AUDIO_READY_V9 */','HUOHUO_VIDEO_AUDIO_READY_V9')
 patch_file(service,json.dumps(media+'?v=9'),json.dumps(media+'?v=10')+' /* HUOHUO_VIDEO_AUDIO_READY_V10 */','HUOHUO_VIDEO_AUDIO_READY_V10')
 text=service.read_text()
 if 'HUOHUO_VIDEO_AUDIO_BIND_V3' not in text:
  import re
  lines=re.findall(r'note:observed\.note,[^\n]*HUOHUO_VIDEO_AUDIO_BOUND_TYPE_V2[^\n]*',text)
  if len(lines)!=1:raise RuntimeError('视频音轨绑定结构变化，未修改')
  patch_file(service,lines[0],'note:observed.note,videoAudio:observed.videoAudio,media:message.media, /* HUOHUO_VIDEO_AUDIO_HANDOFF HUOHUO_VIDEO_AUDIO_BOUND_TYPE HUOHUO_VIDEO_AUDIO_BOUND_TYPE_V2 HUOHUO_VIDEO_AUDIO_BIND_V3 */','HUOHUO_VIDEO_AUDIO_BIND_V3')
 patch_file(service,json.dumps(media+'?v=10'),json.dumps(media+'?v=11')+' /* HUOHUO_ADAPTIVE_VIDEO_V1 */','HUOHUO_ADAPTIVE_VIDEO_V1')
 patch_file(service,'videoAudio:observed.videoAudio,media:message.media, /*','videoAudio:observed.videoAudio,visualTimeline:observed.visualTimeline,videoUnderstanding:observed.videoUnderstanding,media:message.media, /* HUOHUO_VIDEO_UNDERSTANDING_HANDOFF ','HUOHUO_VIDEO_UNDERSTANDING_HANDOFF')
 patch_file(service,'async observeMessage(id,messageId,{signal,includeWork=true,onVideoObservation}={})','async observeMessage(id,messageId,{signal,includeWork=true,onVideoObservation,query=""}={}) /* HUOHUO_VIDEO_DETAIL_QUERY */','HUOHUO_VIDEO_DETAIL_QUERY')
 patch_file(service,"kind:'private-share',url:resolved.url,signal,browserConnection:","kind:'private-share',url:resolved.url,query:query||message.text||'',signal,browserConnection: /* HUOHUO_VIDEO_QUERY_INPUT */",'HUOHUO_VIDEO_QUERY_INPUT')
 patch_file(service,'await this.observeMessage(contact.id,item.id,{signal});',"await this.observeMessage(contact.id,item.id,{signal,query:fresh.map(m=>m.text||'').join(' ').slice(-600)}); /* HUOHUO_VIDEO_QUERY_CONTEXT */",'HUOHUO_VIDEO_QUERY_CONTEXT')
 text=agent.read_text()
 patch_file(agent,text,'import {videoUnderstandingSummary} from '+json.dumps((WORKSPACE/'lib/video-understanding.mjs').as_uri())+'; // HUOHUO_VIDEO_UNDERSTANDING_IMPORT\n'+text,'HUOHUO_VIDEO_UNDERSTANDING_IMPORT')
 patch_file(agent,'  const videoAudio=videoAudioSummary(observation);','  Object.assign(summary,videoUnderstandingSummary(observation)); // HUOHUO_VIDEO_UNDERSTANDING_SUMMARY\n  const videoAudio=videoAudioSummary(observation);','HUOHUO_VIDEO_UNDERSTANDING_SUMMARY')
 patch_file(service,json.dumps(passive+'?v=2'),json.dumps(passive+'?v=3')+' /* HUOHUO_VIDEO_MODEL_PASSIVE_V3 */','HUOHUO_VIDEO_MODEL_PASSIVE_V3')
 patch_file(service,json.dumps(media+'?v=11'),json.dumps(media+'?v=12')+' /* HUOHUO_ADAPTIVE_VIDEO_V2 */','HUOHUO_ADAPTIVE_VIDEO_V2')
 patch_file(service,json.dumps(media+'?v=12'),json.dumps(media+'?v=13')+' /* HUOHUO_OMNI_FAILOVER_V1 */','HUOHUO_OMNI_FAILOVER_V1')
 patch_file(service,json.dumps(media+'?v=13'),json.dumps(media+'?v=14')+' /* HUOHUO_OMNI_EVIDENCE_V2 */','HUOHUO_OMNI_EVIDENCE_V2')
 patch_file(agent,json.dumps((WORKSPACE/'lib/video-understanding.mjs').as_uri()),json.dumps((WORKSPACE/'lib/video-understanding.mjs').as_uri()+'?v=4')+' /* HUOHUO_OMNI_SUMMARY_V2 */','HUOHUO_OMNI_SUMMARY_V2')
 patch_file(agent,'+outputGuidance;','+outputGuidance+(mediaObservations.some(o=>o.videoUnderstanding||o.videoAudio)?"\\n视频回复事实核对：云端视频分析只是候选解释，不是权威事实。回复前先用原始对白与结尾检查它的因果解释；特别检查是否混淆对象、归属或时间，是否把角色的指控当成已证实的错误。结尾澄清归属时，应修正前面的误会；没有独立佐证，不要断言某人被拆穿、做错、甩锅或赖账。证据支持多种解释时保留不确定性。人格的调侃不能改变事实。":""); /* HUOHUO_VIDEO_GROUNDING_SYSTEM */','HUOHUO_VIDEO_GROUNDING_SYSTEM')
 return '收到的抖音视频：播放器音轨→本地转写→与画面共同交给回复模型'
if __name__=='__main__':print(apply_video_audio())
