"""Portable paths and checked OneBot transport; never log credentials."""
import json, os, shutil, subprocess, tempfile, time, urllib.request
from pathlib import Path
WORKSPACE = Path(os.environ.get('HUOHUO_WORKSPACE', Path(__file__).resolve().parents[1]))
USER_HOME = Path(os.environ.get('HUOHUO_HOME', Path.home()))
HARNESS = Path(os.environ.get('DSH_HOME', USER_HOME/'Library/Application Support/dsh-desktop/harness'))
STATE = WORKSPACE/'.state'
def atomic_json(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.'+path.name)
    try:
        with os.fdopen(fd,'w') as f:
            json.dump(value,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
        os.chmod(tmp,0o600);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def config():return json.loads((WORKSPACE/'automation.json').read_text())
def curl_proxy_args():
    """curl does not inherit the HTTPS proxy configured in macOS Settings."""
    import sys,re
    if sys.platform!='darwin' or any(os.environ.get(k) for k in ['https_proxy','HTTPS_PROXY','all_proxy','ALL_PROXY']):return []
    try:
        value=subprocess.run(['/usr/sbin/scutil','--proxy'],capture_output=True,text=True,timeout=3,check=True).stdout
        if not re.search(r'HTTPSEnable\s*:\s*1\b',value):return []
        host=re.search(r'HTTPSProxy\s*:\s*([^\s]+)',value);port=re.search(r'HTTPSPort\s*:\s*(\d+)',value)
        if not host or not port or not 1<=int(port[1])<=65535:return []
        if not re.fullmatch(r'[a-zA-Z0-9.\-]+',host[1]):return []
        return ['--proxy','http://'+host[1]+':'+port[1]]
    except (OSError,subprocess.SubprocessError):return []
def ffmpeg():
    for p in [os.environ.get('FFMPEG_PATH'),str(WORKSPACE/'.runtime/bin/ffmpeg'),str(WORKSPACE/'node_modules/ffmpeg-static/ffmpeg'),shutil.which('ffmpeg'),str(WORKSPACE/'ffmpeg')]:
        if not p or not Path(p).is_file():continue
        try:
            subprocess.run([p,'-version'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5);return p
        except (OSError,subprocess.SubprocessError):pass
    raise RuntimeError('缺少兼容当前芯片的 ffmpeg，请运行 ./setup.sh')
def onebot_token():return (USER_HOME/'.dsh/secrets/onebot.token').read_text().strip()
class BeforeDeliveryError(RuntimeError):
    """Local/preflight failure: no OneBot HTTP request was dispatched."""
    pass

def check_runner(deadline=None):
    for attempt in range(2):
        remaining=deadline-time.time() if deadline is not None else 30
        if remaining<=0:raise BeforeDeliveryError('语音已过期，未发送')
        try:
            result=subprocess.run([str(WORKSPACE/'node-run.sh'),str(WORKSPACE/'lib/fleet.mjs'),'check','--json'],capture_output=True,text=True,timeout=min(30,remaining))
            if result.returncode==0:return
            try:detail=json.loads(result.stderr)
            except (ValueError,TypeError):detail={}
            code=detail.get('code','FLEET_CHECK_FAILED')
            # Messages from the JS guard are credential-free; never include raw stderr.
            message=detail.get('message','运行权限检查失败')
            retryable=detail.get('retryable') is True
        except subprocess.TimeoutExpired:
            code,message,retryable='FLEET_CHECK_TIMEOUT','运行权限检查超时',True
        except OSError:
            code,message,retryable='FLEET_CHECK_UNAVAILABLE','运行权限检查程序不可用',False
        if not retryable or attempt==1:raise BeforeDeliveryError('%s：%s；尚未发送'%(code,message))
        if deadline is not None and time.time()+1>=deadline:raise BeforeDeliveryError('语音已过期，未发送')
        time.sleep(1)

def onebot(action,payload=None,timeout=20,on_dispatch=None,deadline=None):
    import re
    if not re.fullmatch(r'[a-zA-Z0-9_]+',action):raise ValueError('非法接口名称')
    if re.match(r'^(send_|set_|delete_|upload_)',action):
        check_runner(deadline)
    req=urllib.request.Request(config()['onebot_url'].rstrip('/')+'/'+action,data=json.dumps(payload or {}).encode(),headers={'Authorization':'Bearer '+onebot_token(),'Content-Type':'application/json'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    if deadline is not None and time.time()>=deadline:raise BeforeDeliveryError('语音已过期，未发送')
    if on_dispatch:on_dispatch()
    with opener.open(req,timeout=timeout) as r:value=json.load(r)
    if value.get('status')!='ok' or value.get('retcode',0)!=0:raise RuntimeError('OneBot %s 失败，retcode=%s'%(action,value.get('retcode')))
    return value.get('data')
