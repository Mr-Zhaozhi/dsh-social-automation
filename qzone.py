#!/usr/bin/env python3
import argparse,json,sys,fcntl,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from runtime import WORKSPACE,STATE,onebot,atomic_json
from qzone_diary import context,prepare,read,validate,evidence,today,history_rows,day_of,capabilities,spec_id

def publish(prepared_file,call=onebot):
 import hashlib
 p=Path(prepared_file).resolve()
 if not p.is_relative_to((STATE/'qzone-diary').resolve()):raise ValueError('仅发布创作流程生成的prepared.json')
 data=read(p,{})
 if data.get('status')!='ready':raise ValueError('此素材没有验证可用的自动发布入口，未发布，也未降级为文字')
 spec=data['spec'];validate(spec,evidence(WORKSPACE),read(STATE/'qzone-diary/history.json',[])[-14:])
 if data.get('id')!=spec_id(spec) or p.name!='prepared.json' or p.parent.name!=data['id']:raise ValueError('稿件已变化，请重新prepare')
 assets=data.get('assets',[])
 if spec['format'] in ('image','gallery') and not (1<=len(assets)<=4 and (spec['format']!='gallery' or len(assets)==len(spec['panels']))):raise ValueError('配图数量与稿件不一致')
 if any(x not in data.get('hashes',{}) for x in assets):raise ValueError('配图缺少校验记录')
 # Do not hash or upload arbitrary files from an edited descriptor.
 from qzone_diary import safe_image
 for name in data.get('hashes',{}):safe_image(name,WORKSPACE)
 for name,digest in data.get('hashes',{}).items():
  if hashlib.sha256(Path(name).read_bytes()).hexdigest()!=digest:raise ValueError('素材已变化，请重新prepare')
 STATE.mkdir(exist_ok=True)
 with (STATE/'qzone.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  ledger=read(STATE/'qzone.json',{})
  if ledger.get('day')==today():raise ValueError('今天已发布或结果待确认，不重复发布')
  rows=history_rows(call('get_qzone_msg_list',{'num':20}))
  if any(day_of(r.get('time'))==today() for r in rows):raise ValueError('空间里已有今天的说说，本轮跳过')
  # Reconstruct from validated fields; do not trust a manually altered payload.
  payload={'content':spec['content']+('\n'+spec['url'] if spec['format']=='link' else ''),'ugc_right':1}
  if spec['format'] in ('image','gallery'):payload['images']=[Path(safe_image(x,WORKSPACE)).as_uri() for x in data['assets']]
  atomic_json(STATE/'qzone.json',{'day':today(),'status':'pending','prepared':str(p)})
  try:
   receipt=call('send_qzone_msg',payload)
   if not isinstance(receipt,dict) or not receipt.get('tid'):raise ValueError('无发布回执，结果待确认')
   atomic_json(STATE/'qzone.json',{'day':today(),'status':'confirmed','result':receipt,'prepared':str(p)})
   records=read(STATE/'qzone-diary/history.json',[]);records.append({**spec,'receipt':receipt});atomic_json(STATE/'qzone-diary/history.json',records[-60:]);return {'status':'confirmed','receipt':receipt,'format':spec['format']}
  except Exception:
   atomic_json(STATE/'qzone.json',{'day':today(),'status':'unknown','prepared':str(p)});raise
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['context','capabilities','prepare','publish']);p.add_argument('--spec',type=Path);p.add_argument('--prepared',type=Path);a=p.parse_args()
 if a.action=='context':r=context(onebot('get_qzone_msg_list',{'num':20}))
 elif a.action=='capabilities':r=capabilities()
 elif a.action=='prepare':
  if not a.spec:p.error('prepare需要--spec稿件路径')
  r=prepare(json.loads(a.spec.read_text()))
 else:
  if not a.prepared:p.error('publish需要--prepared素材清单路径')
  r=publish(a.prepared)
 print(json.dumps(r,ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as e:print('空间任务未完成：'+str(e),file=sys.stderr);sys.exit(1)
