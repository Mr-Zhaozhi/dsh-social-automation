#!/usr/bin/env python3
"""Download pinned public installers; verify before using or packaging."""
import argparse, concurrent.futures, hashlib, json, os, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'lib'))
from runtime import curl_proxy_args

def fetch(item,cache):
 target=cache/item['file'];algorithm=item.get('algorithm','sha256')
 def valid(p):
  h=hashlib.new(algorithm)
  with p.open('rb') as f:
   for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
  return h.hexdigest()==item['hash']
 if target.exists() and valid(target):return {'file':target.name,'bytes':target.stat().st_size,'cached':True}
 target.parent.mkdir(parents=True,exist_ok=True);temp=target.with_suffix(target.suffix+'.partial')
 # Retry from the downloaded offset instead of restarting large installers.
 for attempt in range(4):
  result=subprocess.run(['curl','--fail','--location','--continue-at','-','--connect-timeout','20','--max-time','900','--silent','--show-error',*curl_proxy_args(),item['url'],'--output',str(temp)])
  if result.returncode==0:break
  if result.returncode==33 and temp.exists():temp.unlink() # server cannot resume
  if attempt==3:result.check_returncode()
 if not valid(temp):temp.unlink(missing_ok=True);raise RuntimeError('组件校验失败：'+item['file'])
 os.replace(temp,target);return {'file':target.name,'bytes':target.stat().st_size,'cached':False}

def main():
 p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,default=ROOT/'.state/share-components');a=p.parse_args()
 items=json.loads((ROOT/'share/components.json').read_text())['components'];a.cache.mkdir(parents=True,exist_ok=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for future in concurrent.futures.as_completed([pool.submit(fetch,item,a.cache) for item in items]):print(json.dumps(future.result()),flush=True)
if __name__=='__main__':main()
