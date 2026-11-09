#!/usr/bin/env python3
"""Install pinned local ASR for either Mac architecture; no personal API key."""
import argparse,gzip,hashlib,json,os,platform,shutil,subprocess,sys,tarfile,tempfile
from pathlib import Path
from runtime import WORKSPACE,HARNESS,curl_proxy_args
MODEL='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
SHA='7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e'
URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'+MODEL+'.tar.bz2'

def configure(patch,root):
    import re
    text=patch.read_text();parts=re.split(r'(?m)(?=^- id: )',text)
    matches=[i for i,p in enumerate(parts) if p.startswith('- id: dsh-onebot\n')]
    if len(matches)!=1:raise RuntimeError('没有唯一 QQ 插件设置，未修改')
    i=matches[0];part=parts[i]
    # Our settings use scalar/inline-list YAML only; replace those exact keys.
    part=re.sub(r'(?m)^    stt(?:Enabled|Engine|Command|Args|Model|TimeoutMs):[^\n]*\n','',part)
    values={'sttEnabled':True,'sttEngine':'custom','sttCommand':str(root/'.runtime/stt-venv/bin/python'),'sttArgs':[str(root/'lib/stt.py'),'--file','{file}','--out','{out}'],'sttTimeoutMs':60000}
    if part.count('  config:\n')!=1:raise RuntimeError('QQ 配置结构不明确')
    part=part.replace('  config:\n','  config:\n'+''.join('    '+k+': '+json.dumps(v,ensure_ascii=False)+'\n' for k,v in values.items()))
    parts[i]=part;patch.write_text(''.join(parts))

def ready(root=WORKSPACE):
    python=root/'.runtime/stt-venv/bin/python';model=root/'.runtime/stt-model'/MODEL
    if not python.exists() or not all((model/f).is_file() for f in ['model.int8.onnx','tokens.txt']):return False
    try:subprocess.run([str(python),'-c','import sherpa_onnx,numpy'],check=True,capture_output=True,timeout=15);return True
    except (OSError,subprocess.SubprocessError):return False

def install(archive=None):
    root=WORKSPACE;runtime=root/'.runtime';runtime.mkdir(exist_ok=True)
    bindir=runtime/'bin';bindir.mkdir(exist_ok=True)
    probe=bindir/'ffprobe';arch='arm64' if platform.machine()=='arm64' else 'x64'
    if not probe.exists():
        item=next(x for x in json.loads((root/'share/components.json').read_text())['components'] if x['kind']=='ffprobe' and x['arch']==arch)
        cache=root/'.state/share-components';cache.mkdir(exist_ok=True,parents=True);download=cache/item['file']
        if not download.exists():subprocess.run(['curl',*curl_proxy_args(),'-fL','--retry','2','--max-time','300','-o',str(download),item['url']],check=True)
        if hashlib.sha256(download.read_bytes()).hexdigest()!=item['hash']:raise RuntimeError('ffprobe checksum mismatch')
        with gzip.open(download,'rb') as source,probe.open('wb') as target:shutil.copyfileobj(source,target)
        probe.chmod(0o755)
    subprocess.run([str(probe),'-version'],check=True,stdout=subprocess.DEVNULL)
    base=Path('/Applications/DSH Desktop.app/Contents/Resources/office-runtime/primary-runtime/dependencies/python/bin/python3')
    if not base.exists():base=Path(sys.executable)
    venv=runtime/'stt-venv'
    if not ready():
        subprocess.run([str(base),'-m','venv','--without-pip',str(venv)],check=True)
        env=os.environ.copy();proxy=curl_proxy_args()
        if proxy:env['https_proxy']=proxy[1]
        subprocess.run([str(base),'-m','pip','--python',str(venv/'bin/python'),'install','sherpa-onnx==2.0.1','numpy==2.2.6'],check=True,env=env)
        directory=runtime/'stt-model';directory.mkdir(exist_ok=True)
        archive=Path(archive) if archive else directory/'sensevoice.tar.bz2'
        if not archive.exists():subprocess.run(['curl',*proxy,'-fL','--retry','2','--max-time','900','-o',str(archive),URL],check=True)
        if hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA:raise RuntimeError('语音模型校验失败，未安装')
        with tarfile.open(archive,'r:bz2') as tar:
            members=tar.getmembers()
            for m in members:
                p=Path(m.name)
                if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0]!=MODEL or not(m.isfile() or m.isdir()):raise RuntimeError('语音模型包含不安全路径')
            tar.extractall(directory,members=members)
    if not ready():raise RuntimeError('语音引擎安装后检查失败')
    configure(HARNESS/'profiles/web/cordis.patch.yml',root)
    print('本地语音识别已就绪：SenseVoice CPU；QQ 与抖音复用，无额外 API Key。')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--archive');args=parser.parse_args();install(args.archive)
