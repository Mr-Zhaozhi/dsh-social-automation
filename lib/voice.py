#!/usr/bin/env python3
"""Durable, serialized Breeze-only speech. Ambiguous sends are never auto-retried."""
import argparse, base64, fcntl, hashlib, json, os, random, re, sqlite3, subprocess, sys, tempfile, time, urllib.error, urllib.request, uuid
from pathlib import Path
from contextlib import contextmanager
from runtime import WORKSPACE, USER_HOME, STATE, config, ffmpeg, onebot, atomic_json

def database():
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    db=sqlite3.connect(str(STATE/'voice.sqlite3'),timeout=10);db.row_factory=sqlite3.Row
    db.execute('BEGIN IMMEDIATE')
    db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, fingerprint TEXT, created REAL, updated REAL, status TEXT, text TEXT, target TEXT, audio TEXT, error TEXT, message_id TEXT)')
    columns={row[1] for row in db.execute('PRAGMA table_info(jobs)')}
    for column in ('voice_id','mood'):
        if column not in columns:db.execute('ALTER TABLE jobs ADD COLUMN '+column+' TEXT')
    db.commit()
    os.chmod(STATE/'voice.sqlite3',0o600)
    return db

@contextmanager
def worker_lock():
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (STATE/'voice.lock').open('a') as f:
        try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:yield False;return
        try:yield True
        finally:fcntl.flock(f,fcntl.LOCK_UN)

def target_of(value):
    if not re.fullmatch(r'(?:private:|group:)?[1-9][0-9]{4,15}',value):raise ValueError('目标须为 QQ号、private:QQ号 或 group:群号；不会自动跨私聊/群聊发送')
    return value if ':' in value else 'private:'+value

def select_voice(text='',mood='auto',voice_id=None,voice_name='auto'):
    v=config()['voice']
    profiles=v.get('profiles') or {'normal':{'id':v['id'],'instructions':v['instructions']}}
    if mood not in ('auto','normal','gentle','comfort','sad','playful','happy'):raise ValueError('心情须为 auto、normal、gentle、comfort、sad、playful 或 happy')
    if mood=='auto':
        mood='comfort' if re.search(r'别怕|别难过|抱抱|慢慢来|不着急|晚安|好好休息|陪着你|没关系',text) else 'normal'
    aliases={'本声':'self','真实声音':'self','小伴本声':'self','自己的声音':'self','配置的固定音色':'jinx','活力小女生':'lively','粤语女声':'cantonese','于谦北京话男生':'beijing','北京话男声':'beijing','劫':'zed','英雄联盟劫':'zed'}
    voice_name=aliases.get(voice_name,voice_name)
    if voice_name!='auto':
        if voice_name not in profiles:raise ValueError('未知音色，请选择 self、jinx、lively、cantonese、beijing 或 zed')
        requested=profiles[voice_name]['id']
        if voice_id and voice_id!=requested:raise ValueError('音色名称与 ID 冲突')
        voice_id=requested
    if voice_id:
        choice=next((p for p in profiles.values() if p['id']==voice_id),None)
        if choice is None:raise ValueError('只允许主人当前配置的音色，不使用已退役音色或通用音色')
    else:
        # Local weighted choice: no extra model request. A job keeps this choice on retries.
        primary=v.get('primary_profile','normal')
        weights=v.get('mood_weights',{}).get(mood,{primary:1})
        if not weights or any(k not in profiles or not isinstance(w,(int,float)) or w<0 for k,w in weights.items()) or sum(weights.values())<=0:
            raise ValueError('音色权重配置无效')
        point=random.random()*sum(weights.values())
        choice=profiles[primary]
        for key,weight in weights.items():
            point-=weight
            if point<0:choice=profiles[key];break
    if mood in ('gentle','comfort','sad'):
        choice={**choice,'instructions':choice['instructions']+' 语气温柔放松，轻声安慰，保持原音色，不刻意气声。'}
    return {**v,**choice,'mood':mood,'profile':next(k for k,p in profiles.items() if p['id']==choice['id'])}

def select_video_voice(spec):
    platform=spec.get('platform','douyin')
    if platform not in ('douyin','xiaohongshu','qq','wechat','zhihu'):raise ValueError('未知视频目标平台')
    if platform=='douyin':
        profile=config()['voice'].get('video_profiles',{}).get('douyin','self')
        if profile!='self':raise ValueError('抖音视频必须使用小伴本声配置')
        return select_voice(spec.get('text',''),spec.get('mood','auto'),voice_name=profile)
    return select_voice(spec.get('text',''),spec.get('mood','auto'),voice_name=spec.get('voice','auto'))

def enqueue(text,target,mood='auto',voice_id=None,voice_name='auto'):
    text=text.strip();target=target_of(target)
    if not 0<len(text)<=config()['voice']['max_chars']:raise ValueError('语音须为 1–160 字，请缩短文本')
    selected=select_voice(text,mood,voice_id,voice_name)
    digest=hashlib.sha256((target+'\0'+text).encode()).hexdigest()
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        previous=db.execute("SELECT id FROM jobs WHERE fingerprint=? AND created>? AND status IN ('queued','synthesizing','sending','sent','unknown') ORDER BY created DESC LIMIT 1",(digest,time.time()-300)).fetchone()
        if previous:return previous['id'],True
        if db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','synthesizing')").fetchone()[0]>=8:raise RuntimeError('语音队列已满，本条改用文字')
        job=uuid.uuid4().hex[:16]
        db.execute('INSERT INTO jobs (id,fingerprint,created,updated,status,text,target,voice_id,mood) VALUES (?,?,?,?,?,?,?,?,?)',(job,digest,time.time(),time.time(),'queued',text,target,selected['id'],selected['mood']))
        return job,False

def update(db,job,status,**fields):
    fields.update(status=status,updated=time.time())
    db.execute('UPDATE jobs SET '+','.join(k+'=?' for k in fields)+' WHERE id=?',(*fields.values(),job));db.commit()

def validate_audio(p):
    r=subprocess.run([ffmpeg(),'-v','error','-xerror','-i',str(p),'-f','null','-'],capture_output=True,timeout=20)
    if r.returncode or r.stderr.strip() or p.stat().st_size<800:raise RuntimeError('音频不完整或无法解码')

def synthesize(text,voice_id=None,mood='auto',voice_name='auto'):
    v=select_voice(text,mood,voice_id,voice_name)
    if v['provider']!='breeze':raise RuntimeError('QQ 语音只允许已配置的 Breeze 克隆音色')
    identity=dict(text=text,voice=v['id'],model=v['model'],instructions=v['instructions'],format='wav_24000',version=3)
    slug=hashlib.sha256(json.dumps(identity,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:24]
    out=WORKSPACE/'memes/voice';out.mkdir(parents=True,exist_ok=True)
    audio=out/('breeze-'+slug+'.wav');meta=audio.with_suffix('.json')
    if audio.exists() and meta.exists():
        try:
            m=json.loads(meta.read_text())
            if m.get('identity')==identity and m.get('sha256')==hashlib.sha256(audio.read_bytes()).hexdigest():
                validate_audio(audio);return audio
        except (RuntimeError,ValueError,subprocess.SubprocessError):pass
    key=(USER_HOME/'.dsh/secrets/breeze.key').read_text().strip()
    body=json.dumps(dict(text=text,model_id=v['model'],language_code='zh',instructions=v['instructions'])).encode()
    url='https://api.breeze.blue/v1/text-to-speech/'+v['id']+'?output_format=wav_24000'
    last_error='合成失败'
    with tempfile.TemporaryDirectory(prefix='.voice-',dir=out) as td:
        raw=Path(td)/'raw.wav';converted=Path(td)/'converted.wav'
        for attempt in range(v['attempts']):
            try:
                started=time.monotonic()
                payload=Path(td)/'request.json';payload.write_bytes(body);payload.chmod(0o600)
                # Credentials go through stdin, never command arguments/process listings.
                curl_config='header = '+json.dumps('xi-api-key: '+key)+'\n'
                from runtime import curl_proxy_args
                result=subprocess.run(['curl',*curl_proxy_args(),'--silent','--show-error','--max-time',str(v['request_timeout']),
                    '--connect-timeout','10','--config','-','--header','Content-Type: application/json',
                    '--data-binary','@'+str(payload),'--output',str(raw),'--write-out','%{http_code}',url],
                    input=curl_config,text=True,capture_output=True,timeout=v['request_timeout']+5)
                code=int(result.stdout or 0)
                if code!=200:
                    raise urllib.error.HTTPError(url,code,'Breeze HTTP error',{},None)
                if result.returncode:raise RuntimeError('音频下载不完整，curl='+str(result.returncode))
                if raw.stat().st_size>8*1024*1024:raise RuntimeError('音频响应超限')
                validate_audio(raw)
                subprocess.run([ffmpeg(),'-y','-v','error','-xerror','-i',str(raw),'-ar','24000','-ac','1','-af','apad=pad_dur=0.8','-codec:a','pcm_s16le',str(converted)],check=True,capture_output=True,timeout=20)
                validate_audio(converted);os.replace(converted,audio)
                atomic_json(meta,dict(identity=identity,provider='breeze',voice_id=v['id'],seconds=round(time.monotonic()-started,2),sha256=hashlib.sha256(audio.read_bytes()).hexdigest()))
                return audio
            except urllib.error.HTTPError as e:
                last_error='Breeze HTTP %s'%e.code
                if e.code not in (0,429,500,502,503,504):break
            except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as e:last_error=type(e).__name__+': '+str(e)[:160]
            if attempt+1<v['attempts']:time.sleep(6*(attempt+1))
    raise RuntimeError(last_error+'；固定音色合成失败，本条不发送，不切换通用声音')

def check_target(target):
    kind,number=target.split(':')
    if kind=='group':
        groups=onebot('get_group_list') or []
        if not any(str(g.get('group_id'))==number for g in groups):raise RuntimeError('机器人不在指定群中')
    return kind,int(number)

def send(target,audio,on_dispatch=None,deadline=None):
    kind,number=check_target(target)
    data=onebot('send_group_msg' if kind=='group' else 'send_private_msg',{('group_id' if kind=='group' else 'user_id'):number,'message':[{'type':'record','data':{'file':'base64://'+base64.b64encode(audio.read_bytes()).decode()}}]},on_dispatch=on_dispatch,deadline=deadline)
    if not isinstance(data,dict) or not data.get('message_id'):raise RuntimeError('发送回执缺少 message_id，结果待确认，禁止自动重发')
    return str(data['message_id'])

def worker():
    with worker_lock() as acquired:
        if not acquired:return
        with database() as db:
            db.execute("UPDATE jobs SET status='unknown',error='上次发送中断，需人工确认，未自动重发' WHERE status='sending'")
            db.execute("UPDATE jobs SET status='queued' WHERE status='synthesizing'");db.commit()
            while True:
                job=db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
                if not job:return
                if time.time()-job['created']>config()['voice']['queue_expiry_seconds']:
                    update(db,job['id'],'expired',error='排队过久，跳过陈旧语音');continue
                try:
                    check_target(job['target'])
                    selected=select_voice(job['text'],job['mood'] or 'auto',job['voice_id'])
                    update(db,job['id'],'synthesizing',voice_id=selected['id'],mood=selected['mood'])
                    audio=synthesize(job['text'],voice_id=selected['id'],mood=selected['mood'])
                    if time.time()-job['created']>config()['voice']['queue_expiry_seconds']:
                        update(db,job['id'],'expired',error='语音已过期，缓存保留但不发送');continue
                    update(db,job['id'],'synthesizing',audio=str(audio))
                    mid=send(job['target'],audio,on_dispatch=lambda:update(db,job['id'],'sending'),deadline=job['created']+config()['voice']['queue_expiry_seconds'])
                    update(db,job['id'],'sent',message_id=mid)
                except Exception as e:
                    st=db.execute('SELECT status FROM jobs WHERE id=?',(job['id'],)).fetchone()[0]
                    update(db,job['id'],'unknown' if st=='sending' else 'failed',error=str(e)[:220])

def kick_worker():
    with (STATE/'voice-worker.log').open('ab') as f:
        env=os.environ.copy();env.pop('BG',None)
        subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker'],stdin=subprocess.DEVNULL,stdout=f,stderr=f,start_new_session=True,env=env)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bg',action='store_true');p.add_argument('--worker',action='store_true');p.add_argument('--status',nargs='?',const='all')
    p.add_argument('--synthesize-only',action='store_true');p.add_argument('--balance',action='store_true');p.add_argument('--kx',action='store_true')
    p.add_argument('--mood',default='auto',choices=['auto','normal','gentle','comfort','sad','playful','happy'])
    p.add_argument('--voice-id',help='仅可使用配置中的音色；日常聊天优先传 --mood')
    p.add_argument('--voice',dest='voice_name',default='auto',help='auto、self、jinx、lively、cantonese、beijing、zed；也支持完整中文音色名')
    p.add_argument('text',nargs='?');p.add_argument('target',nargs='?');p.add_argument('voice',nargs='?');args=p.parse_args()
    if args.worker:worker();return
    if args.status:
        with database() as db:
            rows=db.execute('SELECT id,status,target,created,updated,audio,error,message_id,voice_id,mood FROM jobs '+('WHERE id=?' if args.status!='all' else 'ORDER BY created DESC LIMIT 10'),(() if args.status=='all' else (args.status,))).fetchall()
            print(json.dumps([dict(r) for r in rows],ensure_ascii=False,indent=2));return
    if args.balance:
        key=(USER_HOME/'.dsh/secrets/breeze.key').read_text().strip()
        with urllib.request.urlopen(urllib.request.Request('https://api.breeze.blue/v1/balance',headers={'xi-api-key':key,'User-Agent':'huohuo-automation/2.0'}),timeout=15) as r:d=json.load(r)
        print('余额：%s 积分'%d.get('balance'));return
    if not args.text:p.error('需要语音文本')
    if args.kx:
        if args.voice_name not in ('auto','jinx','配置的固定音色'):p.error('--kx 与指定音色冲突')
        args.voice_name='jinx'
    if args.voice and args.voice_id and args.voice!=args.voice_id:p.error('音色参数冲突')
    voice_id=args.voice_id or args.voice
    if args.synthesize_only:
        if not 0<len(args.text)<=config()['voice']['max_chars']:p.error('文本长度须为 1–160 字')
        with worker_lock() as acquired:
            if not acquired:raise RuntimeError('语音队列正在工作，请稍后合成测试')
            print(synthesize(args.text,voice_id=voice_id,mood=args.mood,voice_name=args.voice_name))
        return
    job,duplicate=enqueue(args.text,args.target or config()['owner_qq'],mood=args.mood,voice_id=voice_id,voice_name=args.voice_name);kick_worker()
    with database() as db:selected=db.execute('SELECT voice_id,mood FROM jobs WHERE id=?',(job,)).fetchone()
    print(json.dumps(dict(job_id=job,status='existing' if duplicate else 'queued',**dict(selected)),ensure_ascii=False),flush=True)
    if args.bg or os.environ.get('BG'):return
    deadline=time.monotonic()+55
    while time.monotonic()<deadline:
        with database() as db:r=db.execute('SELECT status,error,message_id FROM jobs WHERE id=?',(job,)).fetchone()
        if r['status'] in ('sent','failed','expired','unknown'):
            print(json.dumps(dict(r),ensure_ascii=False))
            if r['status']!='sent':sys.exit(2)
            return
        time.sleep(1)
    print('任务仍在后台；用 ./say.sh --status '+job+' 查询，请勿重复发送')
if __name__=='__main__':
    try:main()
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
