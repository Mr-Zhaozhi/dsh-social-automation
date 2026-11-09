#!/usr/bin/env python3
import sys,argparse,json,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from runtime import WORKSPACE,STATE,atomic_json
p=argparse.ArgumentParser();p.add_argument('action',choices=['status','stop','resume']);p.add_argument('key',nargs='?',default='all');p.add_argument('--confirm-old-stopped',action='store_true');a=p.parse_args()
rules=json.loads((WORKSPACE/'automation-schedules.json').read_text())
if a.key!='all' and a.key not in [r['key'] for r in rules]:p.error('未知任务 key')
if a.action=='status':
 print(json.dumps([{'key':r['key'],'enabled':r['enabled'],'id':r['id']} for r in rules],ensure_ascii=False,indent=2))
else:
 if a.action=='resume' and not a.confirm_old_stopped:p.error('启用前请确认旧机器已停用，再加 --confirm-old-stopped')
 atomic_json(STATE/'schedule-requests'/(uuid.uuid4().hex+'.json'),{'action':a.action,'key':a.key})
 print('请求已记录；DSH 运行时一分钟内处理。用 doctor.sh 查看，不要手改运行中的 schedule.json。')
