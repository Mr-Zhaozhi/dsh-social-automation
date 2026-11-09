import os,signal,subprocess,sys,time
from runtime import onebot,STATE
pattern=r'^/Applications/QQ.app/Contents/MacOS/QQ($| )'
def pids():
 r=subprocess.run(['pgrep','-f',pattern],capture_output=True,text=True)
 return [int(x) for x in r.stdout.split()]
if sys.argv[1]=='stop':
 for pid in pids():os.kill(pid,signal.SIGTERM)
 print('已请求机器人 QQ 退出；未操作普通 QQ-MAS。')
else:
 try:
  onebot('get_login_info',timeout=3);print('QQ 机器人已登录，接口在线。');sys.exit(0)
 except Exception:pass
 if pids():
  if '--recover' not in sys.argv:print('机器人进程已存在，接口尚未就绪；可使用“一键启动小伴.command”恢复。');sys.exit(1)
  # Explicit recovery only; normal start never interrupts a pending login.
  for pid in pids():os.kill(pid,signal.SIGTERM)
  for _ in range(50):
   if not pids():break
   time.sleep(.2)
  if pids():print('QQ 尚未退出，未强杀，也未重复启动。');sys.exit(1)
 STATE.mkdir(parents=True,exist_ok=True)
 with (STATE/'bot.log').open('ab') as log:subprocess.Popen(['/Applications/QQ.app/Contents/MacOS/QQ','--no-sandbox'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 (STATE/'bot.log').chmod(0o600)
 print('已启动机器人进程，登录状态请用 ./doctor.sh 查看；需要时扫码。')
