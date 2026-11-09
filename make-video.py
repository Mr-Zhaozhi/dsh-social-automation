#!/usr/bin/env python3
"""Render an owned-character short video with fixed-voice narration and captions."""
import argparse,hashlib,json,math,re,subprocess,sys,tempfile,wave
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from runtime import WORKSPACE,ffmpeg,atomic_json
from voice import synthesize,select_video_voice
from video_editorial import review,assets_for
from video_shots import shot_plan,shot_filter
def stamp(t):
 n=round(t*100);return f'{n//360000:01}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def run(args):subprocess.run([ffmpeg(),'-hide_banner','-loglevel','error','-y',*args],check=True,timeout=600)
def validate_story(spec):
 title=spec.get('title','');text=spec.get('text','');assets=spec.get('assets',[]);beats=spec.get('beats',[])
 if not 1<=len(title)<=20 or not 70<=len(text)<=160:raise ValueError('自动小剧场须有70至160字完整文案，标题1至20字')
 cards=spec.get('visual_mode')=='diary_cards'
 if not isinstance(beats,list) or not 3<=len(beats)<=6 or any(not isinstance(s,str) or not s.strip() for s in beats) or ''.join(beats)!=text:raise ValueError('beats须有3至6个分镜，拼接必须等于text')
 if not cards and (not 3<=len(assets)<=6 or len(set(assets))!=len(assets) or len(beats)!=len(assets)):raise ValueError('3至6个不同情境素材须与beats逐一对应；也可用diary_cards制作新画面')
 return beats
def caption_parts(text,limit=12):
 parts=[]
 for sentence in filter(str.strip,re.split(r'(?<=[，。！？：；])',text)):
  parts.extend(sentence[i:i+limit] for i in range(0,len(sentence),limit))
 return parts
def render(spec,out):
 beats=validate_story(spec)
 spec={**spec,'shot_plan':shot_plan(spec,len(beats))}
 editorial=review(spec,WORKSPACE)
 title=spec['title'];text=spec['text'];assets=assets_for(spec,WORKSPACE)
 if spec.get('visual_mode')!='diary_cards' and all('/memes/' in str(p) for p in assets):raise ValueError('整片只有表情包无法表现情节，请至少准备一个具体场景或实际动作镜头')
 for prior in (WORKSPACE/'videos').glob('*.json'):
  try:old=json.loads(prior.read_text())
  except (ValueError,OSError):continue
  if old.get('video') and old.get('text')==text:raise ValueError('文案与已制作作品重复，请重新创作')
 # Render each story beat against its actual recorded voice, not character weights.
 audio=out.resolve().with_suffix('.narration.wav');audio.parent.mkdir(parents=True,exist_ok=True)
 timeline=[];frames=[];params=None;cursor=0
 selected=select_video_voice(spec)
 for i,beat in enumerate(beats):
  source=synthesize(beat,voice_id=selected['id'],mood=selected['mood'])
  with wave.open(str(source)) as w:
   current=(w.getnchannels(),w.getsampwidth(),w.getframerate());data=w.readframes(w.getnframes())
  if params and params!=current:raise ValueError('分段音频格式不一致')
  params=current;rate=params[2];frame_bytes=params[0]*params[1]
  # Voice synthesis adds exactly 0.8 s of silence. Keep 0.22 s between beats.
  if i<len(beats)-1:data=data[:-round(.58*rate)*frame_bytes]
  seconds=len(data)/frame_bytes/rate
  if seconds>14:raise ValueError('单镜头配音超过14秒，请拆短分镜')
  timeline.append({'start':round(cursor,4),'end':round(cursor+seconds,4),'text':beat,'asset':str(assets[i].relative_to(WORKSPACE))})
  frames.append(data);cursor+=seconds
 with wave.open(str(audio),'wb') as w:
  w.setnchannels(params[0]);w.setsampwidth(params[1]);w.setframerate(params[2]);w.writeframes(b''.join(frames))
 duration=cursor
 if not 15<=duration<=90:raise ValueError('自动发布小剧场需15至90秒完整内容；不通过补空白或重复片段凑时长')
 out=out.resolve();out.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='huohuo-video-') as td:
  temp=Path(td);clips=[]
  for i,p in enumerate(assets):
   clip=temp/f'{i}.mp4';seconds=timeline[i]['end']-timeline[i]['start']
   if p.suffix.lower() in ('.mp4','.webm'):
    probe=subprocess.run([ffmpeg(),'-i',str(p)],capture_output=True,text=True).stderr
    match=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',probe)
    if not match or sum(float(v)*k for v,k in zip(match.groups(),[3600,60,1]))<seconds-.05:raise ValueError('视频素材短于对应配音，请缩短分镜或生成更长镜头')
    inputs=['-i',str(p)]
   else:inputs=['-stream_loop','-1','-i',str(p)] if p.suffix.lower()=='.gif' else ['-loop','1','-i',str(p)]
   palette='0x171b33'
   motion=shot_filter(spec['shot_plan'][i]['layout'],i,seconds,card=spec.get('visual_mode')=='diary_cards')
   run(['-f','lavfi','-i',f'color=c={palette}:s=1080x1920:r=30',*inputs,'-filter_complex',motion,'-map','[v]','-t',str(seconds),'-an','-c:v','libx264','-preset','fast','-crf','18',str(clip)]);clips.append(clip)
  listing=temp/'clips.txt';listing.write_text(''.join("file '"+str(p)+"'\n" for p in clips))
  ass=temp/'captions.ass'
  header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,PingFang SC,66,&H00FFFFFF,&H000000FF,&H00211738,&H80000000,-1,0,0,0,100,100,1,0,1,2,0,8,95,145,230,1
Style: Caption,PingFang SC,56,&H00FFFFFF,&H000000FF,&H003C245A,&H80000000,-1,0,0,0,100,100,0,0,3,12,0,2,100,155,360,1
Style: Footer,PingFang SC,30,&H00CCAFE8,&H000000FF,&H003C245A,&H80000000,0,0,0,0,100,100,0,0,1,0,0,2,80,140,250,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
  clean=lambda s:s.replace('\\','').replace('{','').replace('}','').replace('\n',' ')
  label={'diary':'数字日记','discovery':'见闻手记','creation':'创作手记','fiction':'虚构小剧场'}[spec['content_type']]
  lines=[f'Dialogue: 0,0:00:00.00,{stamp(min(3,duration))},Title,,0,0,0,,{clean(title)}',f'Dialogue: 0,0:00:00.00,{stamp(duration)},Footer,,0,0,0,,小伴的{label} · AI创作']
  for beat in timeline:
   parts=caption_parts(beat['text']);weight=sum(len(x) for x in parts);cursor=beat['start']
   speech_end=max(cursor,beat['end']-(.8 if beat is timeline[-1] else .22))
   for part in parts:
    end=cursor+(speech_end-beat['start'])*len(part)/weight
    lines.append(f'Dialogue: 1,{stamp(cursor)},{stamp(end)},Caption,,0,0,0,,{clean(part)}');cursor=end
  ass.write_text(header+'\n'.join(lines)+'\n')
  temporary=out.with_name(out.stem+'.partial.mp4')
  try:
   run(['-f','concat','-safe','0','-i',str(listing),'-i',str(audio),'-vf','ass='+str(ass),'-t',str(duration),'-c:v','libx264','-preset','veryfast','-crf','18','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart',str(temporary)])
   run(['-xerror','-i',str(temporary),'-f','null','-']);temporary.replace(out)
  finally:temporary.unlink(missing_ok=True)
 atomic_json(out.with_suffix('.json'),{**spec,'platform':spec.get('platform','douyin'),'voice':selected['profile'],'editorial':editorial,'voice_id':selected['id'],'voice_mood':selected['mood'],'audio':str(audio),'duration':round(duration,2),'video':str(out),'ai_generated':True,'quality_checked':True,'renderer_version':3,'width':1080,'height':1920,'fps':30,'timeline':timeline,'caption_max_chars':12,'video_sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
 print(json.dumps({'video':str(out),'seconds':round(duration,2),'title':title},ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--spec',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 try:render(json.loads(a.spec.read_text()),a.out)
 except Exception as e:print('视频制作失败：'+str(e),file=sys.stderr);sys.exit(1)
