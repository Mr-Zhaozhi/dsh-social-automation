#!/usr/bin/env python3
"""Fresh Mac setup using verified installers and the recipient's own identity."""
import argparse, getpass, gzip, hashlib, json, os, platform, plistlib, re, secrets, shlex, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path

DSH_APP=Path('/Applications/DSH Desktop.app')
PYTHON=DSH_APP/'Contents/Resources/office-runtime/primary-runtime/dependencies/python/bin/python3'
HELPER=DSH_APP/'Contents/Frameworks/DSH Desktop Helper.app/Contents/MacOS/DSH Desktop Helper'
CLI=DSH_APP/'Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'

def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name(p.name+'.tmp');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(p)

def verify_component(path,item):
 h=hashlib.new(item.get('algorithm','sha256'))
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 if h.hexdigest()!=item['hash']:raise RuntimeError('安装文件校验失败：'+path.name)

def verify_source(source):
 source=source.resolve();manifest=json.loads((source/'MANIFEST.json').read_text())
 for name,digest in manifest['files'].items():
  path=(source/name).resolve()
  if not path.is_relative_to(source) or not path.is_file():raise RuntimeError('源码文件缺失或路径越界：'+name)
  verify_component(path,{'hash':digest})

def extract_zip(source,destination):
 with zipfile.ZipFile(source) as z:
  for m in z.infolist():
   p=Path(m.filename)
   if p.is_absolute() or '..' in p.parts or (m.external_attr>>16)&0o170000==0o120000:raise RuntimeError('组件压缩包路径不安全')
  z.extractall(destination)
  for m in z.infolist():
   if not m.is_dir() and m.external_attr>>16:(destination/m.filename).chmod((m.external_attr>>16)&0o777)

def copy_app(source,target):
 command=['/usr/bin/ditto',str(source),str(target)]
 result=subprocess.run(command,capture_output=True,text=True)
 if result.returncode:
  subprocess.run(['osascript','-e','on run argv','-e','do shell script item 1 of argv with administrator privileges','-e','end run',shlex.join(command)],check=True)

def clear_finder_metadata(app):
 # Finder metadata is outside the signed file contents. Keep quarantine and
 # all other attributes; never re-sign applications or suppress verification.
 for name in ['com.apple.FinderInfo','com.apple.ResourceFork']:
  subprocess.run(['/usr/bin/xattr','-r','-s','-d',name,str(app)],check=True)

def verified_app_source(source,temporary):
 check=['codesign','--verify','--deep','--strict']
 result=subprocess.run(check+[str(source)],capture_output=True,text=True)
 if result.returncode==0:return source
 if 'resource fork, Finder information, or similar detritus not allowed' not in result.stderr:
  raise RuntimeError('应用签名检查失败：'+result.stderr.strip())
 staged=temporary/'verified'/source.name;staged.parent.mkdir()
 subprocess.run(['/usr/bin/ditto',str(source),str(staged)],check=True)
 clear_finder_metadata(staged)
 subprocess.run(check+[str(staged)],check=True)
 return staged

def install_dmg(archive,name):
 target=Path('/Applications')/name
 if target.exists():print('保留已安装应用：'+name,flush=True);return
 with tempfile.TemporaryDirectory(prefix='dsh-app-') as td:
  mount=Path(td)/'mount';mount.mkdir()
  subprocess.run(['hdiutil','attach','-quiet','-readonly','-nobrowse','-mountpoint',str(mount),str(archive)],check=True)
  try:
   source=mount/name
   if not source.is_dir():raise RuntimeError('安装包中缺少 '+name)
   source=verified_app_source(source,Path(td))
   copy_app(source,target)
  finally:subprocess.run(['hdiutil','detach','-quiet',str(mount)],check=True)

def configure(home,workspace,owner,bot,voice_id='',nickname='朋友'):
 """No network, no task activation, no imported credentials. Safe to resume."""
 for value in [owner,bot]:
  if not re.fullmatch(r'[1-9]\d{4,19}',value):raise ValueError('主人及机器人 QQ 号须为 5–20 位数字')
 if owner==bot:raise ValueError('主人 QQ 与机器人 QQ 不能相同')
 if not (workspace/'.share-edition').is_file():raise ValueError('只能安装共享版源码')
 cfg=json.loads((workspace/'automation.json').read_text())
 if cfg.get('owner_qq') and cfg['owner_qq']!=owner:raise RuntimeError('此目录已有其他主人，未覆盖')
 if cfg.get('bot_qq') and cfg['bot_qq']!=bot:raise RuntimeError('此目录已有其他机器人账号，未覆盖')
 rules=json.loads((workspace/'automation-schedules.json').read_text())
 if any(r.get('enabled') for r in rules) or json.loads((workspace/'social-planner.json').read_text()).get('enabled'):raise RuntimeError('已有自动运营任务在使用，先暂停后再维护安装')
 harness=home/'Library/Application Support/dsh-desktop/harness';patch=harness/'profiles/web/cordis.patch.yml';text=patch.read_text() if patch.exists() else ''
 marker='# DSH_SHARED_DEPLOY_CONFIG'
 if re.search(r'(?m)^- id: dsh-onebot\s*$',text) and marker not in text:raise RuntimeError('检测到已有 QQ 插件配置，未覆盖；请用独立新环境安装')
 for p in (home/'Library/LaunchAgents').glob('com.huohuo.*.plist'):
  old=plistlib.loads(p.read_bytes()).get('WorkingDirectory')
  if old and Path(old).resolve()!=workspace.resolve():raise RuntimeError('存在其他工作区后台服务，未覆盖')
 directory=home/'.dsh/secrets';token_file=directory/'onebot.token'
 if token_file.exists() and marker not in text:raise RuntimeError('已有 OneBot 凭据，未覆盖；请用独立新环境安装')
 directory.mkdir(parents=True,exist_ok=True,mode=0o700)
 if token_file.exists():token=token_file.read_text().strip()
 else:token=secrets.token_urlsafe(24);token_file.write_text(token+'\n');token_file.chmod(0o600)
 cfg.update(owner_qq=owner,bot_qq=bot)
 if voice_id:cfg['voice']['id']=voice_id
 write_json(workspace/'automation.json',cfg)
 prefs=json.loads((workspace/'interaction-policy.json').read_text());prefs['nickname']=nickname;write_json(workspace/'interaction-policy.json',prefs)
 data=home/'Library/Containers/com.tencent.qq/Data'
 nap_cfg=data/'Library/Application Support/QQ/NapCat/config'/('onebot11_'+bot+'.json')
 if not nap_cfg.exists():
  write_json(nap_cfg,{'network':{'httpServers':[{'name':'dsh-http','enable':True,'host':'127.0.0.1','port':3000,'enableCors':False,'enableWebsocket':False,'messagePostFormat':'array','token':token,'debug':False}],'httpSseServers':[],'httpClients':[],'websocketServers':[],'websocketClients':[{'name':'dsh','enable':True,'url':'ws://127.0.0.1:8643','messagePostFormat':'array','reportSelfMessage':False,'token':token,'debug':False,'heartInterval':30000,'reconnectInterval':3000}],'plugins':[]},'musicSignUrl':'','enableLocalFile2Url':True,'parseMultMsg':True})
 if marker not in text:
  config={'mode':'reverse','host':'127.0.0.1','port':8643,'accessToken':token,'botQQ':bot,'adminUsers':[owner],'dmPolicy':'open','groupPolicy':'open','requireMention':True,'agentPreset':'standard','workspacePath':str(workspace),'interimMessages':True,'textImageThreshold':150,'rateLimitPerMinute':10,'restrictedMemberPrefix':False,'permissions':{'memberTools':'all'}}
  block='\n'+marker+'\n- id: dsh-onebot\n  config: '+json.dumps(config,ensure_ascii=False)+'\n- id: any-audio\n  config: {prompt: false, routes: true}\n'
  patch.parent.mkdir(parents=True,exist_ok=True);patch.write_text(text+block);patch.chmod(0o600)
 loader=data/'Documents/loadNapCat.js';loader.parent.mkdir(parents=True,exist_ok=True)
 if not loader.exists():loader.write_text("const path=require('node:path');const {pathToFileURL}=require('node:url');\nif(!process.argv.includes('-q'))process.argv.push('-q',"+json.dumps(bot)+");\nimport(pathToFileURL(path.join(__dirname,'napcat/napcat.mjs')).href).catch(e=>console.error('NapCat failed:',e.message));\n")
 return {'harness':harness,'token_file':token_file,'napcat_config':nap_cfg}

def runtime(workspace,components,arch):
 bindir=workspace/'.runtime/bin';bindir.mkdir(parents=True,exist_ok=True)
 for name,target in [('python3',PYTHON),('node',HELPER)]:
  f=bindir/name;f.write_text('#!/bin/sh\n'+('export ELECTRON_RUN_AS_NODE=1\n' if name=='node' else '')+'exec '+shlex.quote(str(target))+' "$@"\n');f.chmod(0o755)
 ff=bindir/'ffmpeg'
 with gzip.open(components/('ffmpeg-darwin-'+arch+'.gz'),'rb') as src,ff.open('wb') as dst:shutil.copyfileobj(src,dst)
 ff.chmod(0o755);subprocess.run([str(ff),'-version'],stdout=subprocess.DEVNULL,check=True)
 probe=bindir/'ffprobe'
 with gzip.open(components/('ffprobe-darwin-'+arch+'.gz'),'rb') as src,probe.open('wb') as dst:shutil.copyfileobj(src,dst)
 probe.chmod(0o755);subprocess.run([str(probe),'-version'],stdout=subprocess.DEVNULL,check=True)
 for script in [*workspace.glob('*.sh'),*workspace.glob('*.command')]:
  text=script.read_text()
  if 'DSH_SHARED_RUNTIME_PATH' not in text:
   lines=text.splitlines(True);lines.insert(1,'export PATH="$(cd "$(dirname "$0")" && pwd)/.runtime/bin:$PATH" # DSH_SHARED_RUNTIME_PATH\n');script.write_text(''.join(lines));script.chmod(0o755)
 # Direct Python entry points also work when launched by a fresh DSH process
 # whose environment does not contain a system/Homebrew Python installation.
 for script in workspace.glob('*.py'):
  text=script.read_text()
  if text.startswith('#!/usr/bin/env python3'):
   script.write_text('#!/bin/sh\n""":"\nexec "$(dirname "$0")/python-run.sh" "$0" "$@"\n":"""\n'+text.split('\n',1)[1]);script.chmod(0o755)

def main():
 p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path,required=True);p.add_argument('--workspace',type=Path);p.add_argument('--owner-qq');p.add_argument('--bot-qq');p.add_argument('--plan',action='store_true');a=p.parse_args()
 bundle=a.bundle.resolve();home=Path.home();workspace=(a.workspace or home/'Documents/DSH-Automation-Share').resolve();components=bundle/'components';manifest=json.loads((components/'components.json').read_text())
 arch='arm64' if platform.machine()=='arm64' or subprocess.run(['sysctl','-in','sysctl.proc_translated'],capture_output=True,text=True).stdout.strip()=='1' else 'x64'
 if a.plan:print(json.dumps({'architecture':arch,'workspace':str(workspace),'components':[v['file'] for v in manifest['components']],'steps':['verify','install missing applications','copy clean source','initialize recipient identity','install pinned plugins','configure NapCat and QQ','install background services','recipient logs in'],'automations_enabled':False},ensure_ascii=False,indent=2));return
 if platform.system()!='Darwin':raise RuntimeError('此部署包用于 macOS')
 if not PYTHON.exists() or not HELPER.exists():raise RuntimeError('请先运行开始安装.command，安装 DSH Desktop')
 version=plistlib.loads((DSH_APP/'Contents/Info.plist').read_bytes()).get('CFBundleShortVersionString')
 if version!='0.13.2':raise RuntimeError('本包验证基线为 DSH Desktop 0.13.2；当前版本不同，请先核对兼容性')
 for item in manifest['components']:
  print('校验 '+item['file'],flush=True);verify_component(components/item['file'],item)
 verify_source(bundle/'workspace')
 if workspace.exists() and not (workspace/'.share-edition').is_file():raise RuntimeError('目标目录已有其他内容，未覆盖')
 if not workspace.exists():shutil.copytree(bundle/'workspace',workspace)
 for script in workspace.rglob('*'):
  if script.is_file() and script.suffix in {'.sh','.command'}:script.chmod(0o755)
 cfg=json.loads((workspace/'automation.json').read_text());owner=a.owner_qq or cfg.get('owner_qq') or input('主人 QQ（你自己的账号）：').strip();bot=a.bot_qq or cfg.get('bot_qq') or input('机器人 QQ（另一个账号）：').strip()
 # All identity and existing-install checks happen before application or QQ writes.
 configured=configure(home,workspace,owner,bot)
 install_dmg(components/'qq.dmg','QQ.app');install_dmg(components/'microsoft-edge.dmg','Microsoft Edge.app')
 runtime(workspace,components,arch)
 env={**os.environ,'DSH_HOME':str(configured['harness']),'HUOHUO_WORKSPACE':str(workspace),'PATH':str(workspace/'.runtime/bin')+':'+os.environ.get('PATH',''),'ELECTRON_RUN_AS_NODE':'1'}
 # The desktop pnpm runtime is already included; avoid requiring Homebrew/npm.
 pnpm=workspace/'.runtime/bin/pnpm';pnpm.write_text('#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec '+shlex.quote(str(HELPER))+' '+shlex.quote(str(DSH_APP/'Contents/Resources/app.asar/node_modules/pnpm/bin/pnpm.cjs'))+' "$@"\n');pnpm.chmod(0o755)
 profile=configured['harness']/'profiles/web';profile.mkdir(parents=True,exist_ok=True)
 policy=profile/'pnpm-workspace.yaml'
 if not policy.exists():policy.write_text('autoInstallPeers: false\nhoist: false\n')
 command=[str(HELPER),str(CLI),'plugin','--profile','web']
 subprocess.run(command+['allow-version','dsh-browser-cdp@1.7.5','--dsh-version','0.2.2-alpha.2','--accept-risk'],env=env,check=True)
 # Original registry archives are bundled. The host resolves remaining public
 # dependencies and preserves its own generation/peer-module consistency.
 # pnpm records local archive paths. Keep them in the installed workspace so
 # deleting the downloaded deployment folder cannot break later repairs.
 packages=workspace/'.runtime/packages';packages.mkdir(parents=True,exist_ok=True)
 archives=[]
 for item in manifest['components']:
  if item['kind']!='plugin':continue
  target=packages/item['file'];shutil.copyfile(components/item['file'],target);archives.append(str(target))
 print('安装固定版本插件及其依赖（首次需要联网）…',flush=True)
 subprocess.run(command+['add',*archives],env=env,check=True)
 napcat=home/'Library/Containers/com.tencent.qq/Data/Documents/napcat'
 if not (napcat/'napcat.mjs').exists():
  napcat.mkdir(parents=True,exist_ok=True);extract_zip(components/'NapCat.Shell.zip',napcat)
  if not (napcat/'napcat.mjs').exists():raise RuntimeError('NapCat 组件结构变化，未修改 QQ 启动文件')
 key=home/'.dsh/secrets/breeze.key'
 if not key.exists():
  value=getpass.getpass('自己的 Breeze API Key（不用语音可直接回车）：').strip()
  if value:key.write_text(value+'\n');key.chmod(0o600)
 cfg=json.loads((workspace/'automation.json').read_text())
 if not cfg['voice']['id']:
  value=input('自己的 Breeze 音色 ID（稍后配置可留空）：').strip()
  if value:
   if not re.fullmatch(r'voc_[A-Za-z0-9_-]+',value):raise ValueError('音色 ID 格式不正确')
   cfg['voice']['id']=value;write_json(workspace/'automation.json',cfg)
 subprocess.run([str(workspace/'python-run.sh'),str(workspace/'lib/setup_stt.py'),'--archive',str(components/'sensevoice-int8.tar.bz2')],cwd=workspace,env=env,check=True)
 subprocess.run([str(workspace/'python-run.sh'),str(workspace/'lib/setup.py'),'--finish'],cwd=workspace,env=env,check=True)
 write_json(workspace/'.state/deployment.json',{'version':1,'source':'clean-shared-deployment','architecture':arch,'configured':True,'automations_enabled':False,'pending':['自己的 DSH 模型连接','QQ 扫码','抖音和小红书登录','主人私聊后绑定会话']})
 subprocess.run(['open','-a',str(DSH_APP)],check=True)
 print('安装配置完成。下一步：在 DSH 配置自己的模型，启动机器人 QQ 扫码，在专用浏览器登录社交账号。所有主动任务仍关闭。')
 print('工作区：'+str(workspace));print('主人私聊机器人一次后运行：./python-run.sh 初始化配置.py --bind-session')
if __name__=='__main__':
 try:main()
 except Exception as e:print('安装未完成：'+str(e),file=sys.stderr);sys.exit(1)
