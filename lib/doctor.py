#!/usr/bin/env python3
import argparse,json,socket,subprocess,datetime,urllib.request
from urllib.parse import urlparse
from pathlib import Path
from runtime import WORKSPACE,USER_HOME,HARNESS,STATE,config,onebot,atomic_json,ffmpeg

def browser_control_status(http_ok,state,probe):
 result={'ok':False,'http_available':bool(http_ok),'control_ready':False}
 if not http_ok:result['error']='浏览器 HTTP 端口未就绪'
 elif not isinstance(state,dict) or state.get('ready') is not True:
  result['error']='浏览器控制未就绪；HTTP 可响应不代表可操控页面'
  if isinstance(state,dict):result['failure_code']=(state.get('launchFailure') or {}).get('code')
 elif not probe():result['error']='浏览器控制握手超时或失败，未操作任何页面'
 else:result.update(ok=True,control_ready=True)
 return result

def probe_browser():
 try:
  r=subprocess.run([str(WORKSPACE/'node-run.sh'),str(WORKSPACE/'lib/browser-probe.mjs'),config()['browser_cdp']],capture_output=True,text=True,timeout=7)
  return r.returncode==0 and json.loads(r.stdout).get('ok') is True
 except Exception:return False

def check():
 result={}
 try:
  d=onebot('get_login_info',timeout=5);result['qq']={'ok':True,'account':str(d.get('user_id'))}
 except Exception as e:result['qq']={'ok':False,'error':str(e)[:120]}
 for name,port in [('dsh',43129),('browser',urlparse(config()['browser_cdp']).port or 80),('onebot_bridge',8643)]:
  try:
   with socket.create_connection(('127.0.0.1',port),timeout=2):pass
   result[name]={'ok':True}
  except OSError:result[name]={'ok':False,'error':'端口未就绪'}
 http_ok=result['browser']['ok'];version=None
 if http_ok:
  try:
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
   with opener.open(config()['browser_cdp']+'/json/version',timeout=3) as r:d=json.load(r)
   version=d.get('Browser')
  except Exception:http_ok=False
 try:browser_state=json.loads((USER_HOME/'.dsh/douyin-browser/control/browser.json').read_text())
 except Exception:browser_state=None
 result['browser']=browser_control_status(http_ok,browser_state,probe_browser)
 if version:result['browser']['version']=version
 try:result['ffmpeg']={'ok':True,'path':ffmpeg()}
 except Exception as e:result['ffmpeg']={'ok':False,'error':str(e)}
 from setup_stt import ready
 result['speech_to_text']={'ok':ready(),'engine':'SenseVoice local CPU','last':json.loads((STATE/'stt-health.json').read_text()) if (STATE/'stt-health.json').exists() else None}
 result['voice']={'ok':(USER_HOME/'.dsh/secrets/breeze.key').exists(),'provider':config()['voice']['provider'],'voice_id':config()['voice']['id'],'profiles':{k:p['id'] for k,p in config()['voice'].get('profiles',{}).items()},'selection':'mood-weighted','automatic_fallback':False}
 try:
  tasks=json.loads((HARNESS/'storages/schedule.json').read_text())['tables']['tasks'];now=datetime.datetime.now(datetime.timezone.utc)
  bad=[];overdue=[]
  for k,t in tasks.items():
   s=t['record']['scheduledAt']
   try:
    dt=datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
    if dt.isoformat(timespec='milliseconds').replace('+00:00','Z')!=s:bad.append(k)
    if t['status']=='active' and (now-dt).total_seconds()>900:overdue.append(k)
   except Exception:bad.append(k)
  result['schedules']={'ok':not bad and not overdue,'invalid':bad,'overdue':overdue,'active':sum(t['status']=='active' for t in tasks.values())}
 except Exception as e:result['schedules']={'ok':False,'error':str(e)[:100]}
 p=STATE/'schedules.json'
 if p.exists():result['renewal']=json.loads(p.read_text())
 p=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local/state'
 for name in ['video','comments','chat']:
  f=p/(name+'-policy.json')
  if f.exists():result['douyin_'+name]={'enabled':json.loads(f.read_text()).get('enabled')}
 if result['dsh']['ok']:
  try:
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
   with opener.open('http://127.0.0.1:43129/api/douyin-browser/state',timeout=8) as r:s=json.load(r)
   friend=s.get('interactions',{}).get('friend',{})
   chat_waiting=bool(friend.get('enabled') and friend.get('selectedCount') and not s.get('chat',{}).get('running'))
   result['douyin_live']={'ok':not bool(s.get('schedule',{}).get('lastError')) and not chat_waiting,'schedule_enabled':s.get('schedule',{}).get('policy',{}).get('enabled'),'watch_running':s.get('watch',{}).get('running'),'watch_status':s.get('watch',{}).get('status'),'error':s.get('schedule',{}).get('lastError'),'daily':s.get('video',{}).get('daily'),'chat_running':s.get('chat',{}).get('running'),'chat_status':friend.get('status'),'chat_wait_reason':friend.get('waitReason') or friend.get('lastError'),'private_budget':s.get('chat',{}).get('daily'),'interactions':s.get('interactions',{}).get('policy',{}).get('enabled')}
  except Exception as e:result['douyin_live']={'ok':False,'error':str(e)[:120]}
 zh=WORKSPACE/'zhihu.json'
 if zh.exists():
  z=json.loads(zh.read_text());status=json.loads((STATE/'zhihu-access.json').read_text()) if (STATE/'zhihu-access.json').exists() else {}
  home=json.loads((STATE/'zhihu-home-access.json').read_text()) if (STATE/'zhihu-home-access.json').exists() else {}
  ready_home=z.get('mode')=='home' and z.get('testStatus')=='home-read-verified' and (not home.get('blocked') or home.get('operation')=='comment')
  result['zhihu']={'ok':z.get('enabled',False) and (ready_home or z.get('testStatus')=='verified' and not status.get('blocked',False)),'mode':z.get('mode','detail'),'enabled':z.get('enabled',False),'test_status':z.get('testStatus'),'detail_blocked':status.get('blocked',False),'posting_paused':home.get('blocked',False),'capabilities':z.get('capabilities',{}),'reason':home.get('reason') or status.get('reason','')}
 planner=STATE/'social-plan.json'
 if planner.exists():result['social_plan']=json.loads(planner.read_text())
 return {'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':result}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--save',action='store_true');a=p.parse_args();r=check()
 if a.save:atomic_json(STATE/'health.json',r)
 else:print(json.dumps(r,ensure_ascii=False,indent=2))
