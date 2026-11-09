#!/usr/bin/env python3
"""One private repository. Git tracks code/settings; the vault tracks private runtime data."""
import argparse,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'lib'))
from runtime import curl_proxy_args
def run(*args,**kw):return subprocess.run(args,cwd=ROOT,check=True,text=True,**kw)
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['update','publish','connect']);a=p.parse_args()
 proxy=curl_proxy_args()
 if proxy:os.environ['HTTPS_PROXY']=proxy[1]
 cfg=json.loads((ROOT/'sync.json').read_text());remote='https://github.com/'+cfg['repository']+'.git'
 if a.action=='connect':
  run(str(ROOT/'node-run.sh'),str(ROOT/'migrate/connect-sync.mjs'))
  if not (ROOT/'.git/config').exists():
   run('git','init','-b',cfg.get('branch','main'));run('git','remote','add','origin',remote)
  run('git','fetch','origin')
  if subprocess.run(['git','rev-parse','--verify','HEAD'],cwd=ROOT,capture_output=True).returncode:run('git','reset','--mixed','origin/'+cfg.get('branch','main'))
  print('私有仓库与双机协调已连接。');return
 if not (ROOT/'.git/config').exists():raise RuntimeError('请先完成 gh auth login，再运行 python3 migrate/sync.py connect。')
 dirty=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True)
 if a.action=='update' and dirty:raise RuntimeError('本机有未同步的改动，请先双击“上传本机改动”，避免覆盖。')
 if a.action=='publish':
  run(str(ROOT/'node-run.sh'),str(ROOT/'migrate/vault.mjs'),'export')
  run('git','add','--all')
  if subprocess.run(['git','diff','--cached','--quiet'],cwd=ROOT).returncode:run('git','commit','--quiet','-m','Sync Huohuo code, settings and encrypted backup')
 old_lock=(ROOT/'package-lock.json').read_bytes();run('git','fetch','origin')
 if a.action=='publish':
  try:run('git','rebase','origin/'+cfg.get('branch','main'))
  except subprocess.CalledProcessError:
   run('git','rebase','--abort');raise RuntimeError('两边修改发生冲突，已恢复本机改动；需要合并后再上传。')
  run('git','push','origin','HEAD:'+cfg.get('branch','main'))
 else:
  run('git','merge','--ff-only','origin/'+cfg.get('branch','main'))
  if old_lock!=(ROOT/'package-lock.json').read_bytes():run(str(ROOT/'setup.sh'),'--no-launch')
  else:run(str(ROOT/'setup.sh'),'--no-install','--no-launch')
  print('代码和共享设置已更新；登录、聊天及发送记录保留本机状态。重启 DSH Desktop 后生效。')
if __name__=='__main__':
 try:main()
 except Exception as e:print('同步未完成：'+str(e),file=sys.stderr);sys.exit(1)
