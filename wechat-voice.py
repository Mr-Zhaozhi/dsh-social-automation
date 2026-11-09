#!/usr/bin/env python3
"""Generate the configured voice file. Sending stays in the current WeChat tool."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from voice import synthesize,select_voice

def generate(text,mood='auto',voice_name='auto'):
    text=text.strip()
    if not text or len(text)>160:raise ValueError('微信语音文字须为1至160字')
    selected=select_voice(text,mood,voice_name=voice_name)
    audio=synthesize(text,voice_id=selected['id'],mood=selected['mood'])
    return {'file_path':str(audio),'delivery':'not-sent','format':'audio-file','voice':'configured-clone','voice_id':selected['id'],'mood':selected['mood']}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('text');parser.add_argument('--mood',default='auto');parser.add_argument('--voice',default='auto');args=parser.parse_args()
    print(json.dumps(generate(args.text,args.mood,args.voice),ensure_ascii=False))
