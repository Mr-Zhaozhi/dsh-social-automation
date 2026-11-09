#!/usr/bin/env python3
"""Run with Python 3.10–3.12. Installs singing in its own environment, never the bot's."""
import os,platform,subprocess,sys,sysconfig,urllib.request,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REV='51383efd921027683c89e5348211d93ff12ac2a8'
sys.path.insert(0,str(ROOT/'lib'))
from runtime import curl_proxy_args

def main():
 if not (3,10)<=sys.version_info[:2]<=(3,12):raise RuntimeError('请使用Python 3.10至3.12运行；不要使用macOS自带Python3.9')
 env=os.environ.copy();proxy=curl_proxy_args()
 if proxy:env.setdefault('HTTPS_PROXY',proxy[-1]);env.setdefault('HTTP_PROXY',proxy[-1])
 def run(args):subprocess.run([str(a) for a in args],check=True,env=env,cwd=ROOT)
 repo=ROOT/'.runtime/seed-vc-src';venv=ROOT/'.runtime/singing-venv';repo.parent.mkdir(exist_ok=True)
 if not repo.exists():run(['git','clone','https://github.com/Plachtaa/seed-vc.git',repo])
 current=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
 if current!=REV:raise RuntimeError('Seed-VC版本不匹配，需维护者检查；不自动覆盖现有代码')
 # --without-pip works with the portable Python bundled by DSH.
 if not (venv/'bin/python').exists():run([sys.executable,'-m','venv','--without-pip',venv])
 torch=['torch==2.2.2','torchaudio==2.2.2','torchvision==0.17.2'] if platform.system()=='Darwin' and platform.machine()=='x86_64' else ['torch==2.5.1','torchaudio==2.5.1','torchvision==0.20.1']
 lock_name='macos-x86_64-python3.12' if platform.system()=='Darwin' and platform.machine()=='x86_64' and sys.version_info[:2]==(3,12) else None
 seed_requirements=ROOT/'singing/locks'/(lock_name+'-seed.txt') if lock_name else ROOT/'singing/requirements.txt'
 run([sys.executable,'-m','pip','--python',venv/'bin/python','install','-r',seed_requirements,*torch[:2]])
 run([venv/'bin/python','-c','import torch,librosa,dac;print("Singing dependencies ready",torch.__version__)'])
 # Portable DSH Python omits headers. Build only matching CPython headers for diffq;
 # never compile/install a replacement interpreter or edit the app bundle.
 if not (Path(sysconfig.get_path('include'))/'Python.h').exists():
  version=platform.python_version();source=ROOT/'.runtime'/('Python-'+version)
  if not (source/'pyconfig.h').exists():
   archive=ROOT/'.runtime'/('Python-'+version+'.tar.xz')
   if not archive.exists():
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({'https':proxy[-1]} if proxy else None))
    with opener.open('https://www.python.org/ftp/python/'+version+'/Python-'+version+'.tar.xz',timeout=120) as r,archive.open('wb') as f:
     import shutil
     shutil.copyfileobj(r,f)
   if not source.exists():
    with tarfile.open(archive) as tar:
     for item in tar.getmembers():
      target=(source.parent/item.name).resolve()
      if source.resolve() not in target.parents and target!=source.resolve():raise RuntimeError('Unsafe Python source archive')
      if item.issym() or item.islnk():raise RuntimeError('Unexpected source archive link')
     tar.extractall(source.parent)
   subprocess.run(['./configure','--without-ensurepip'],cwd=source,env=env,check=True)
  env['CPATH']=str(source/'Include')+os.pathsep+str(source)
 separator=ROOT/'.runtime/singing-separator-venv'
 if not (separator/'bin/python').exists():run([sys.executable,'-m','venv','--without-pip',separator])
 separator_requirements=ROOT/'singing/locks'/(lock_name+'-separator.txt') if lock_name else ROOT/'singing/separator-requirements.txt'
 run([sys.executable,'-m','pip','--python',separator/'bin/python','install','-r',separator_requirements,*torch])
 run([separator/'bin/python','-c','from audio_separator.separator import Separator;print("Separation ready")'])
 print('安装完成。首次唱歌还需下载模型；使用sing.sh，不向原语音队列注入歌曲。')
if __name__=='__main__':main()
