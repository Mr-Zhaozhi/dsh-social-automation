#!/usr/bin/env python3
import argparse,json,os,plistlib,re,shutil,subprocess,sys
from pathlib import Path
from runtime import WORKSPACE,USER_HOME,HARNESS,STATE,atomic_json

def main():
 p=argparse.ArgumentParser();p.add_argument('--finish',action='store_true');p.add_argument('--no-launch',action='store_true');a=p.parse_args()
 patch=HARNESS/'profiles/web/cordis.patch.yml'
 if not patch.is_file():raise RuntimeError('未找到 DSH 插件配置。请先启动 DSH、安装原插件并设置工作区，再运行安装；本次未修改服务。')
 if (WORKSPACE/'.share-edition').exists():
  for name in ['dsh-onebot-qq','dsh-douyin-browser-local']:
   if not (HARNESS/'profiles/web/node_modules'/name/'package.json').is_file():raise RuntimeError('共享版首次安装缺少原插件：'+name)
  for label in ['com.huohuo.mediahttp','com.huohuo.voice','com.huohuo.doctor','com.huohuo.maintenance']:
   existing=USER_HOME/'Library/LaunchAgents'/(label+'.plist')
   if existing.exists():
    old=plistlib.loads(existing.read_bytes()).get('WorkingDirectory')
    if old and Path(old).resolve()!=WORKSPACE.resolve():raise RuntimeError('已有另一工作区的本机服务，未覆盖。请使用独立 macOS 用户或先迁移已有部署。')
 STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
 from setup_stt import install as install_stt
 install_stt()
 from compat import apply
 print(apply())
 from install_stickers import install as install_stickers
 print(install_stickers())
 from chat_delivery import install as install_chat_delivery
 print(install_chat_delivery())
 if patch.exists():
  text=patch.read_text()
  for name in ['reliability','group-listener','social-planner','life','companion','social-inbox','qzone-inbox','douyin-inbox','fleet','zhihu','shared-context','quiet-delivery','group-address','quick-status','web-diagnostics','group-controls','group-conversation','browser-recovery','chat-panel-recovery','interest-search','passive-inbox']:
   uri=(WORKSPACE/'plugins'/f'{name}.mjs').as_uri()
   if f'id: huohuo-{name}' not in text:text+=f'\n- insert:\n    - id: huohuo-{name}\n      name: {uri}\n'
   else:text=re.sub(r'(id: huohuo-'+re.escape(name)+r'\s+name:)\s+\S+',lambda m:m[1]+' '+uri,text)
  patch.write_text(text)
 secrets=USER_HOME/'.dsh/secrets';secrets.mkdir(parents=True,exist_ok=True,mode=0o700)
 token=secrets/'onebot.token'
 if not token.exists():
  q=USER_HOME/'Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/config'
  for f in q.glob('onebot11_*.json'):
   d=json.loads(f.read_text())
   server=next((s for s in d.get('network',{}).get('httpServers',[]) if s.get('port')==3000),None)
   if server and server.get('token'):token.write_text(server['token']+'\n');token.chmod(0o600);break
 if a.finish:
  staged=WORKSPACE/'.migration/plugin-state/dsh-douyin-browser-local';plugin=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
  if staged.exists():
   if plugin.exists():
    target=plugin.resolve()/'state';target.mkdir(exist_ok=True)
    for f in staged.iterdir():
     if f.is_file():shutil.copy2(f,target/f.name)
     elif f.is_dir():shutil.copytree(f,target/f.name,dirs_exist_ok=True)
    staged.rename(staged.with_name(staged.name+'.restored'))
   else:print('待完成：请在 DSH 中安装抖音插件，再运行 setup.sh --finish')
  loader=USER_HOME/'Library/Containers/com.tencent.qq/Data/Documents/loadNapCat.js'
  app=Path('/Applications/QQ.app/Contents/Resources/app/package.json')
  runtime=loader.parent/'napcat/napcat.mjs'
  if loader.exists() and app.exists() and runtime.exists():
   d=json.loads(app.read_text());main=os.path.relpath(loader,app.parent)
   if d.get('main')!=main:
    backup=app.with_name('package.json.before-huohuo');
    if not backup.exists():shutil.copy2(app,backup)
    d['main']=main;atomic_json(app,d)
   from qq_background import install as install_qq_background
   install_qq_background(USER_HOME)
  else:print('待完成：安装官方 QQ 与 NapCat 后，再运行 setup.sh --finish')
 agents=USER_HOME/'Library/LaunchAgents';agents.mkdir(parents=True,exist_ok=True)
 (HARNESS/'media/onebot').mkdir(parents=True,exist_ok=True)
 services=[('com.huohuo.maintenance',[sys.executable,str(WORKSPACE/'lib/maintenance.py'),'--apply'],86400),('com.huohuo.mediahttp',[sys.executable,'-m','http.server','8765','--bind','127.0.0.1','--directory',str(HARNESS/'media/onebot')],0),('com.huohuo.voice',[sys.executable,str(WORKSPACE/'lib/voice.py'),'--worker'],15),('com.huohuo.doctor',[sys.executable,str(WORKSPACE/'lib/doctor.py'),'--save'],300)]
 for label,argv,interval in services:
  f=agents/(label+'.plist')
  d={'Label':label,'ProgramArguments':argv,'StartInterval':interval,'RunAtLoad':True,'WorkingDirectory':str(WORKSPACE),'EnvironmentVariables':{'PATH':str(WORKSPACE/'.runtime/bin')+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},'StandardOutPath':str(STATE/(label+'.log')),'StandardErrorPath':str(STATE/(label+'.error.log'))}
  if label=='com.huohuo.maintenance':d.update(Nice=10,LowPriorityIO=True)
  if interval==0:d.pop('StartInterval');d['KeepAlive']=True
  f.write_bytes(plistlib.dumps(d));f.chmod(0o600)
  if not a.no_launch:
   subprocess.run(['launchctl','bootout','gui/'+str(os.getuid()),str(f)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   subprocess.run(['launchctl','bootstrap','gui/'+str(os.getuid()),str(f)],check=True)
 from launchers import install as install_launchers
 print(install_launchers(WORKSPACE,USER_HOME,sys.executable))
 print('本地队列、健康检查、每日清理与桌面启动入口已配置。首次登录和验收见 NEW_MAC.md。')
if __name__=='__main__':main()
