# -*- coding: utf-8 -*-
"""Provenance-bound public creative media and durable Seedance jobs."""
import base64,datetime,fcntl,hashlib,ipaddress,json,mimetypes,re,socket,subprocess,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlparse,urljoin
from runtime import WORKSPACE,USER_HOME,atomic_json,ffmpeg,curl_proxy_args
MODEL='doubao-seedance-1-0-pro-fast-251015'
BASE='https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
def public_url(url):
 u=urlparse(url)
 if u.scheme!='https' or u.username or u.password or u.port not in (None,443) or not u.hostname:raise ValueError('只允许公开HTTPS素材地址')
 addresses=socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)
 if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise ValueError('素材地址不可指向本机或内网')
 return url
def opener():
 class Redirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,req,fp,code,msg,headers,newurl):
   public_url(newurl)
   return super().redirect_request(req,fp,code,msg,headers,newurl)
 proxy=curl_proxy_args();return urllib.request.build_opener(*([urllib.request.ProxyHandler({'https':proxy[1]})] if proxy else []),Redirect())
def download(url,dst,limit=100*1024*1024):
 public_url(url);temp=dst.with_suffix(dst.suffix+'.part');dst.parent.mkdir(parents=True,exist_ok=True)
 try:
  with opener().open(urllib.request.Request(url,headers={'User-Agent':'huohuo-media/1.0'}),timeout=40) as r,temp.open('wb') as f:
   size=0
   while True:
    chunk=r.read(65536)
    if not chunk:break
    size+=len(chunk)
    if size>limit:raise ValueError('素材超过大小限制')
    f.write(chunk)
  if size<100:raise ValueError('素材为空')
  subprocess.run([ffmpeg(),'-v','error','-xerror','-protocol_whitelist','file,pipe','-i',str(temp),'-t','12','-f','null','-'],check=True,capture_output=True,timeout=40)
  temp.replace(dst)
 finally:temp.unlink(missing_ok=True)
def register(file,metadata,root=WORKSPACE):
 p=Path(file).resolve();p.relative_to(root.resolve());sha=hashlib.sha256(p.read_bytes()).hexdigest()
 atomic_json(p.with_suffix(p.suffix+'.source.json'),{**metadata,'sha256':sha,'file':str(p.relative_to(root.resolve()))});return p
def resolve(file,root=WORKSPACE):
 p=Path(file).resolve()
 if not any(p.is_relative_to((root/d).resolve()) for d in ['assets/external','videos/generated']):raise ValueError('素材不在登记目录')
 m=json.loads(p.with_suffix(p.suffix+'.source.json').read_text())
 if not m.get('license') or not m.get('source_page') or m['sha256']!=hashlib.sha256(p.read_bytes()).hexdigest():raise ValueError('素材来源记录缺失或内容已变化')
 return p

def import_url(url,source_page,license,credit='',root=WORKSPACE):
 if license not in ['CC0','CC-BY','CC-BY-SA','licensed','user-provided']:raise ValueError('需要可再利用的许可记录')
 if license in ['CC-BY','CC-BY-SA'] and not credit.strip():raise ValueError('该许可需要署名')
 public_url(source_page);suffix=Path(urlparse(url).path).suffix.lower()
 if suffix not in ['.png','.jpg','.jpeg','.webp','.gif','.mp4','.webm']:raise ValueError('需要明确的图片或视频格式链接')
 p=root/'assets/external'/(hashlib.sha256(url.encode()).hexdigest()[:20]+suffix)
 if p.exists():return resolve(p,root)
 download(url,p,20*1024*1024 if suffix not in ['.mp4','.webm'] else 100*1024*1024)
 return register(p,dict(source_page=source_page,url=url,license=license,credit=credit,kind='network'),root)
def api(method,suffix='',body=None):
 saved=json.loads((USER_HOME/'.dsh/secrets/huohuo-video-model.json').read_text())
 c=next(v for v in saved.get('providers',[saved]) if v.get('provider')=='doubao')
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*a,**kw):return None
 proxy=curl_proxy_args();client=urllib.request.build_opener(*([urllib.request.ProxyHandler({'https':proxy[1]})] if proxy else []),NoRedirect())
 req=urllib.request.Request(BASE+suffix,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Authorization':'Bearer '+c['apiKey'],'Content-Type':'application/json'})
 try:
  with client.open(req,timeout=45) as r:return json.load(r)
 except urllib.error.HTTPError as e:
  code=''
  try:code=str(json.loads(e.read(8000)).get('error',{}).get('code',''))
  except Exception:pass
  raise RuntimeError('火山接口 HTTP '+str(e.code)+' '+(code if re.fullmatch(r'[\w.-]{1,100}',code) else '')) from None

def create(spec,root=WORKSPACE):
 prompt=spec.get('prompt','');duration=spec.get('duration',5);resolution=spec.get('resolution','1080p')
 if not isinstance(prompt,str) or not 5<=len(prompt)<=1200 or '--' in prompt:raise ValueError('提示词须5至1200字，不含参数开关')
 if duration not in [5,10] or resolution not in ['720p','1080p']:raise ValueError('仅支持5/10秒、720p/1080p')
 image=(root/spec['image']).resolve()
 from video_editorial import assets_for
 assets_for({'assets':[str(image)]},root)
 if image.suffix.lower() not in ['.png','.jpg','.jpeg','.webp'] or image.stat().st_size>15*1024*1024:raise ValueError('首帧须为15MB内的图片')
 fingerprint=hashlib.sha256(json.dumps([MODEL,prompt,duration,resolution,hashlib.sha256(image.read_bytes()).hexdigest()],ensure_ascii=False).encode()).hexdigest()[:24]
 folder=root/'.state/seedance';folder.mkdir(parents=True,exist_ok=True);job=folder/(fingerprint+'.json')
 with (folder/'create.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  if job.exists():return json.loads(job.read_text())
  date=(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))).date().isoformat()
  prior=[json.loads(p.read_text()) for p in folder.glob('*.json')]
  today=[r for r in prior if r.get('date')==date]
  if len(today)>=3 or sum(r.get('duration',0) for r in today)+duration>15:raise ValueError('图生视频每天最多3次、合计15秒；不会重复重试付费任务')
  source_meta=json.loads(image.with_suffix(image.suffix+'.source.json').read_text()) if image.with_suffix(image.suffix+'.source.json').exists() else {}
  row={'input_license':source_meta.get('license','owned'),'input_credit':source_meta.get('credit',''),'local_id':fingerprint,'status':'submitting','date':date,'duration':duration,'model':MODEL,'spec':spec};atomic_json(job,row)
  body={'model':MODEL,'content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':'data:'+mimetypes.guess_type(image.name)[0]+';base64,'+base64.b64encode(image.read_bytes()).decode()}}],'resolution':resolution,'duration':duration,'watermark':True,'camera_fixed':False}
  try:
   result=api('POST',body=body)
   if not re.fullmatch(r'[\w-]{1,120}',result.get('id','')):raise ValueError('任务编号缺失')
   row.update(status='queued',task_id=result['id']);atomic_json(job,row)
  except Exception:
   row['status']='unknown';atomic_json(job,row);raise
  return row

def _status(local_id,root=WORKSPACE):
 if not re.fullmatch(r'[a-f0-9]{24}',local_id):raise ValueError('本地任务编号无效')
 p=root/'.state/seedance'/(local_id+'.json');row=json.loads(p.read_text())
 if row['status']=='downloaded':resolve(root/row['file'],root);return row
 if not row.get('task_id'):raise ValueError('提交结果未知，需在火山控制台核对；不能自动重建')
 result=api('GET','/'+row['task_id']);row['status']=result['status']
 if result['status']=='succeeded':
  url=result.get('content',{}).get('video_url');dst=root/'videos/generated'/(local_id+'.mp4');download(url,dst)
  register(dst,{'license':row.get('input_license') if row.get('input_license') in ['CC-BY','CC-BY-SA'] else 'generated','source_page':'https://console.volcengine.com/ark','kind':'seedance','task_id':row['task_id'],'model':MODEL,'duration':row['duration'],'credit':row.get('input_credit','')},root)
  row.update(status='downloaded',file=str(dst.relative_to(root)),usage=result.get('usage'))
 if result['status']=='failed':row['error_code']=result.get('error',{}).get('code','unknown')
 atomic_json(p,row);return row

def status(local_id,root=WORKSPACE):
 if not re.fullmatch(r'[a-f0-9]{24}',local_id):raise ValueError('本地任务编号无效')
 folder=root/'.state/seedance';folder.mkdir(parents=True,exist_ok=True)
 with (folder/(local_id+'.lock')).open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise ValueError('任务正在查询或下载，请稍后再查')
  return _status(local_id,root)
