#!/usr/bin/env python3
"""Pause/resume all social automation through supported local service endpoints."""
import argparse,json,subprocess,sys,importlib.util
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'lib'))
from runtime import atomic_json,STATE
spec=importlib.util.spec_from_file_location('control',root/'douyin-control.py');control=importlib.util.module_from_spec(spec);spec.loader.exec_module(control)
p=argparse.ArgumentParser();p.add_argument('action',choices=['status','stop','resume']);p.add_argument('--confirm-old-stopped',action='store_true');a=p.parse_args()
if a.action=='status':
 print((root/'social-planner.json').read_text())
 if (STATE/'social-plan.json').exists():print((STATE/'social-plan.json').read_text())
else:
 if a.action=='resume' and not a.confirm_old_stopped:p.error('迁移恢复前请确认旧机器停用，再加 --confirm-old-stopped')
 enabled=a.action=='resume';atomic_json(root/'social-planner.json',{'enabled':enabled,'timeZone':'Asia/Shanghai'})
 if not enabled:
  control.request('watch/schedule',{'enabled':False});control.request('interactions/configure',{'enabled':False})
 else:
  # Force a new future plan rather than resuming an old time window.
  if (STATE/'social-plan.json').exists():
   v=json.loads((STATE/'social-plan.json').read_text());v['status']='resume-requested';v.pop('plan',None);atomic_json(STATE/'social-plan.json',v)
 rules=json.loads((root/'automation-schedules.json').read_text())
 for r in rules:
  if r['key'] in {'douyin-like','douyin-post','xhs-social'}:
   subprocess.run([sys.executable,str(root/'schedule-control.py'),a.action,r['key'],*(['--confirm-old-stopped'] if enabled else [])],check=True)
 print('社交自动化'+('恢复请求已记录；将在未来时段执行。' if enabled else '已停止；群聊与QQ语音保持可用。'))
