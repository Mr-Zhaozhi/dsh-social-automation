"""Offline, bounded singing jobs. Conversion never falls back to the original singer."""
import argparse,contextlib,fcntl,hashlib,json,os,re,shutil,sqlite3,subprocess,sys,time,uuid,wave,math
from pathlib import Path
from runtime import WORKSPACE,STATE,atomic_json,ffmpeg,curl_proxy_args,onebot
from voice import select_voice,synthesize,send,target_of
ROOT=STATE/'singing'
PYTHON=WORKSPACE/'.runtime/singing-venv/bin/python'
SEPARATOR_PYTHON=WORKSPACE/'.runtime/singing-separator-venv/bin/python'
VERSION=2

def db():
 ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
 conn=sqlite3.connect(str(ROOT/'jobs.sqlite'),timeout=15);conn.row_factory=sqlite3.Row
 conn.execute('BEGIN IMMEDIATE')
 conn.execute('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,created REAL,updated REAL,status TEXT,spec TEXT,cache_key TEXT,audio TEXT,error TEXT,message_id TEXT)')
 columns={r[1] for r in conn.execute('PRAGMA table_info(jobs)')}
 for column in ('stage','notification'):
  if column not in columns:conn.execute('ALTER TABLE jobs ADD COLUMN '+column+' TEXT')
 conn.commit();os.chmod(ROOT/'jobs.sqlite',0o600);return conn

@contextlib.contextmanager
def lock(name):
 ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
 with (ROOT/(name+'.lock')).open('a') as f:
  try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:yield False;return
  try:yield True
  finally:fcntl.flock(f,fcntl.LOCK_UN)

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def update(conn,id,status,**fields):
 fields.update(status=status,updated=time.time())
 conn.execute('UPDATE jobs SET '+','.join(k+'=?' for k in fields)+' WHERE id=?',(*fields.values(),id));conn.commit()
def library():
 p=ROOT/'library.json';return json.loads(p.read_text()) if p.exists() else {}
def local_audio(value):
 p=Path(value).expanduser().resolve()
 if not p.is_file() or p.suffix.lower() not in ('.wav','.mp3','.flac','.m4a','.ogg','.aac'):raise ValueError('需要本地音频文件；不自动抓取歌曲或付费音源')
 if not 800<=p.stat().st_size<=100*1024*1024:raise ValueError('音频文件须小于100MB且非空')
 return p

def import_song(title,source,kind='mix',attribution='',test_only=False):
 if not title.strip() or len(title)>100:raise ValueError('歌名须为1至100字')
 source=local_audio(source)
 if kind not in ('mix','vocals'):raise ValueError('素材类型须为 mix 或 vocals')
 key=digest(source);folder=ROOT/'library';folder.mkdir(parents=True,exist_ok=True)
 dest=folder/(key+source.suffix.lower())
 if source!=dest:shutil.copyfile(source,dest)
 dest.chmod(0o600)
 with lock('library') as acquired:
  if not acquired:raise RuntimeError('曲库正在更新，请稍后再试')
  items=library();items[title.strip()]={'source':str(dest),'sha256':key,'kind':kind,'attribution':attribution[:500],'test_only':test_only};atomic_json(ROOT/'library.json',items)
 return {'title':title.strip(),'kind':kind,'imported':True}

def ready():
 try:
  data=json.loads((ROOT/'ready.json').read_text())
  return data.get('pipeline_verified') is True and data.get('version')==VERSION
 except (OSError,ValueError):return False

def enqueue(title,target=None,start=0,seconds=20):
 start=float(start);seconds=float(seconds)
 if not math.isfinite(start) or not math.isfinite(seconds) or not 0<=start<=3600 or not 5<=seconds<=30:raise ValueError('开始时间0至3600秒；片段5至30秒')
 song=library().get(title)
 if song and target and song.get('test_only'):raise ValueError('这首是仅限本机验收的测试素材，不能发送；请导入自己的歌曲')
 if not song:raise ValueError('曲库没有这首歌。请提供音频后导入；不能把念歌词当唱歌')
 if target and not ready():raise RuntimeError('唱歌环境仍在验收，暂不发送；普通说话不受影响')
 source=local_audio(song['source'])
 if digest(source)!=song['sha256']:raise ValueError('歌曲素材已改变，请重新导入')
 selected=select_voice(voice_name='self',mood='normal')
 spec={'title':title,'source':str(source),'source_hash':song['sha256'],'kind':song['kind'],'start':start,'seconds':seconds,'voice_id':selected['id'],'target':target_of(target) if target else None,'version':VERSION}
 key=hashlib.sha256(json.dumps({k:v for k,v in spec.items() if k not in ('target','title','source')},sort_keys=True).encode()).hexdigest()[:24]
 with db() as conn:
  conn.execute('BEGIN IMMEDIATE')
  # A repeated request during rendering or ambiguous delivery must never enqueue a second send.
  for row in conn.execute('SELECT * FROM jobs WHERE cache_key=? ORDER BY created DESC',(key,)):
   if json.loads(row['spec'])['target']==spec['target'] and (row['status'] in ('queued','rendering','sending','unknown') or (spec['target'] is None and row['status']=='ready' and row['audio'] and Path(row['audio']).is_file()) or row['status']=='sent' and row['updated']>time.time()-300):return row['id'],True
  if conn.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','rendering','sending')").fetchone()[0]>=2:raise RuntimeError('唱歌队列已满，暂时不能再点歌')
  # This is an expensive local model, not an unconstrained autonomous loop.
  if conn.execute('SELECT count(*) FROM jobs WHERE created>?',(time.time()-86400,)).fetchone()[0]>=6:raise RuntimeError('今天唱歌任务已达6次，稍后再唱')
  job=uuid.uuid4().hex[:16];now=time.time()
  conn.execute('INSERT INTO jobs(id,created,updated,status,spec,cache_key) VALUES(?,?,?,?,?,?)',(job,now,now,'queued',json.dumps(spec,ensure_ascii=False),key))
 return job,False

def environment():
 env=os.environ.copy();proxy=curl_proxy_args()
 if proxy:env.setdefault('HTTPS_PROXY',proxy[-1]);env.setdefault('HTTP_PROXY',proxy[-1])
 env.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',HF_HUB_DISABLE_XET='1',PYTORCH_ENABLE_MPS_FALLBACK='1',PYTHONUNBUFFERED='1')
 env['PATH']=str(Path(ffmpeg()).parent)+os.pathsep+env.get('PATH','')
 return env

def run(args,log,timeout=1200,cwd=None):
 with Path(log).open('ab') as out:
  proc=subprocess.Popen([str(a) for a in args],stdout=out,stderr=subprocess.STDOUT,env=environment(),cwd=cwd,start_new_session=True)
  try:
   if proc.wait(timeout=timeout):raise RuntimeError('音频处理失败，详见本地任务日志；未发送原唱')
  except subprocess.TimeoutExpired:
   import signal
   os.killpg(proc.pid,signal.SIGKILL);proc.wait();raise RuntimeError('唱歌处理超时，任务停止，未发送')

def wav_info(path):
 with wave.open(str(path)) as w:
  seconds=w.getnframes()/w.getframerate()
  if w.getnchannels() not in (1,2) or w.getsampwidth()!=2 or not seconds>0:raise ValueError('音频格式校验失败')
 return seconds

def render(spec,key,log,progress=lambda stage:None):
 out=ROOT/'cache'/key;out.mkdir(parents=True,exist_ok=True)
 final=out/'song.wav';meta=out/'result.json'
 if final.exists() and meta.exists():
  data=json.loads(meta.read_text())
  if data.get('sha256')==digest(final) and data.get('voice_id')==spec['voice_id']:
   wav_info(final);return final
 if not PYTHON.is_file() or (spec['kind']=='mix' and not SEPARATOR_PYTHON.is_file()):raise RuntimeError('唱歌环境尚未安装，请运行 singing/setup.py')
 if digest(spec['source'])!=spec['source_hash']:raise ValueError('歌曲素材校验失败')
 # Dedicated neutral reference; never reuse private chat text as the voice prompt.
 progress('reference')
 reference=synthesize('你好，我是小伴。今天想用自己的声音唱一小段歌。听听旋律，放松一下，希望你有个好心情。',voice_id=spec['voice_id'],mood='normal')
 ref=out/'reference.wav';clip=out/'source.wav';f=ffmpeg()
 run([f,'-y','-v','error','-i',reference,'-t','12','-ar','24000','-ac','1','-c:a','pcm_s16le',ref],log,60)
 run([f,'-y','-v','error','-ss',str(spec['start']),'-i',spec['source'],'-t',str(spec['seconds']),'-ar','44100','-ac','2','-c:a','pcm_s16le',clip],log,60)
 duration=wav_info(clip)
 if duration<4.5:raise ValueError('选定片段不足5秒')
 vocals=clip;instrumental=None
 if spec['kind']=='mix':
  progress('separating')
  stems=out/'stems';stems.mkdir(exist_ok=True)
  run([SEPARATOR_PYTHON,WORKSPACE/'singing/separate.py',clip,stems,WORKSPACE/'.runtime/singing-models'],log)
  outputs=json.loads((stems/'stems.json').read_text());vocals=Path(outputs['vocals']);instrumental=Path(outputs['instrumental'])
 progress('converting')
 converted=out/'converted';converted.mkdir(exist_ok=True)
 run([PYTHON,WORKSPACE/'singing/seed_runner.py','--source',vocals,'--target',ref,'--output',converted,'--f0-condition','True','--auto-f0-adjust','False','--semi-tone-shift','0','--diffusion-steps','30','--fp16','False'],log,1800)
 files=list(converted.glob('vc_*.wav'))
 if len(files)!=1:raise RuntimeError('未得到唯一歌声转换结果，停止发送')
 # Preserve pitch, timing and accompaniment; normalize only after conversion and mixing.
 progress('mixing')
 temp=out/'mix.tmp.wav'
 args=[f,'-y','-v','error','-i',files[0]]
 if instrumental:
  args+=['-i',instrumental,'-filter_complex','[0:a]volume=1.0[v];[1:a]volume=0.7[b];[v][b]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,apad=pad_dur=0.8[a]','-map','[a]']
 else:args+=['-af','loudnorm=I=-16:TP=-1.5:LRA=9,apad=pad_dur=0.8']
 args+=['-t',str(duration+0.8),'-ar','24000','-ac','1','-c:a','pcm_s16le',temp]
 run(args,log,90)
 actual=wav_info(temp)
 if abs(actual-(duration+0.8))>1.0:raise RuntimeError('转换后音频时长异常，未发送')
 os.replace(temp,final)
 atomic_json(meta,{'voice_id':spec['voice_id'],'sha256':digest(final),'duration':actual,'source_hash':spec['source_hash'],'model':'Seed-VC 44k singing','version':VERSION})
 if spec['kind']=='mix':atomic_json(ROOT/'ready.json',{'version':VERSION,'pipeline_verified':True,'voice_similarity_human_verified':False,'verified_at':time.time(),'sample_sha256':digest(final)})
 return final

def notify_failure(conn,id,spec):
 if not spec.get('target'):return
 row=conn.execute('SELECT status,notification,created FROM jobs WHERE id=?',(id,)).fetchone()
 if row['status']!='failed' or row['notification'] or time.time()-row['created']>3600:return
 kind,number=spec['target'].split(':')
 try:
  result=onebot('send_group_msg' if kind=='group' else 'send_private_msg',
   {('group_id' if kind=='group' else 'user_id'):int(number),'message':[{'type':'text','data':{'text':'这段歌没做成功，这次没发出去。等修好再唱给你听。'}}]},
   on_dispatch=lambda:update(conn,id,'failed',notification='pending'))
  update(conn,id,'failed',notification='sent' if result and result.get('message_id') else 'unknown')
 except Exception:
  current=conn.execute('SELECT notification FROM jobs WHERE id=?',(id,)).fetchone()[0]
  update(conn,id,'failed',notification='unknown' if current=='pending' else 'not-sent')

def worker():
 try:os.nice(10)
 except OSError:pass
 with lock('worker') as acquired:
  if not acquired:return
  with db() as conn:
   conn.execute("UPDATE jobs SET status='unknown',error='上次发送中断，禁止自动重发' WHERE status='sending'")
   conn.execute("UPDATE jobs SET status='queued' WHERE status='rendering'");conn.commit()
   while True:
    row=conn.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
    if not row:return
    spec=json.loads(row['spec']);id=row['id']
    if time.time()-row['created']>3600:update(conn,id,'expired',error='点歌已过期');continue
    try:
     update(conn,id,'rendering');audio=render(spec,row['cache_key'],ROOT/(id+'.log'),progress=lambda stage:update(conn,id,'rendering',stage=stage))
     update(conn,id,'ready',stage='complete',audio=str(audio),error=None)
     if spec['target']:
      if time.time()-row['created']>3600:update(conn,id,'expired',error='制作完成但点歌已过期，文件保留');continue
      mid=send(spec['target'],audio,on_dispatch=lambda:update(conn,id,'sending'),deadline=row['created']+3600)
      update(conn,id,'sent',stage='complete',message_id=mid)
    except Exception as e:
     status=conn.execute('SELECT status FROM jobs WHERE id=?',(id,)).fetchone()[0]
     update(conn,id,'unknown' if status=='sending' else 'failed',error=str(e)[:250])
     notify_failure(conn,id,spec)

def kick():
 ROOT.mkdir(parents=True,exist_ok=True)
 with (ROOT/'worker.log').open('ab') as f:
  subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'worker'],stdin=subprocess.DEVNULL,stdout=f,stderr=f,start_new_session=True)

def main():
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='cmd',required=True)
 imp=sub.add_parser('import');imp.add_argument('--title',required=True);imp.add_argument('--source',required=True);imp.add_argument('--kind',choices=['mix','vocals'],default='mix');imp.add_argument('--attribution',default='');imp.add_argument('--test-only',action='store_true')
 sub.add_parser('list');sub.add_parser('worker');sub.add_parser('doctor')
 st=sub.add_parser('status');st.add_argument('id',nargs='?')
 make=sub.add_parser('sing');make.add_argument('--title',required=True);make.add_argument('--target');make.add_argument('--start',type=float,default=0);make.add_argument('--seconds',type=float,default=20);make.add_argument('--foreground',action='store_true')
 a=p.parse_args()
 if a.cmd=='worker':worker();return
 if a.cmd=='doctor':
  result={'conversion_python':PYTHON.is_file(),'separation_python':SEPARATOR_PYTHON.is_file(),'seed_source':(WORKSPACE/'.runtime/seed-vc-src/inference.py').is_file(),'songs':len(library()),'mode':'offline','max_seconds':30,'pipeline_verified':ready()}
 elif a.cmd=='list':result=[{'title':k,'kind':v['kind'],'test_only':v.get('test_only',False)} for k,v in library().items()]
 elif a.cmd=='import':result=import_song(a.title,a.source,a.kind,a.attribution,a.test_only)
 elif a.cmd=='status':
  with db() as conn:
   rows=conn.execute('SELECT id,status,stage,created,updated,audio,error,message_id FROM jobs '+('WHERE id=?' if a.id else 'ORDER BY created DESC LIMIT 8'),(a.id,) if a.id else ()).fetchall();result=[dict(r) for r in rows]
 else:
  id,duplicate=enqueue(a.title,a.target,a.start,a.seconds)
  if a.foreground:worker()
  else:kick()
  result={'job_id':id,'status':'existing' if duplicate else 'queued','delivery':'background' if a.target else 'preview-only'}
 print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
