#!/usr/bin/env python3
"""Build a clean source edition from an allowlist, never from a private backup."""
import argparse, hashlib, json, os, re, shutil, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {
 'setup.sh','node-run.sh','python-run.sh','browser-start.mjs','start-bot.sh','stop-bot.sh','doctor.sh',
 'say.sh','qq-api.py','hot.py','hot.sh','gen-meme.sh','sync-memes.sh','make-video.py',
 'schedule-control.py','social-control.py','douyin-control.py','douyin-act.mjs',
 'douyin-message.mjs','douyin-share.mjs','douyin-notifications.mjs','comment-once.mjs',
 'xhs.sh','xhs.mjs','xhs-act.mjs','xhs-message.mjs','xhs-share.mjs','xhs-notifications.mjs',
 'package.json','package-lock.json','同步更新.command','上传本机改动.command','连接私有同步.command','一键完整部署打包.command',
}
SOURCE_DIRS = ('lib','plugins','tests','migrate','share')
SOURCE_SUFFIXES = {'.py','.mjs','.sh','.md','.command','.json','.txt','.LICENSE','.README'}
EXCLUDED_PARTS = {'.git','.state','.migration','.runtime','vault','node_modules','__pycache__',
 'checks','media','memes','videos','custom-images','profiles','sessions','secrets'}

def write_json(path, value):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def public_text(text):
 # Presentation only; technical module names remain stable for plugin compatibility.
 return text.replace('祸祸','小伴').replace('金克丝','配置的固定音色').replace('老大','朋友')

def private_values(root):
 values=set()
 def add(value):
  if isinstance(value,str) and len(value)>=5:values.add(value)
 cfg=json.loads((root/'automation.json').read_text())
 add(cfg.get('owner_qq'));add(cfg.get('bot_qq'));add(cfg.get('voice',{}).get('id'))
 for platform in ('douyin','xiaohongshu'):
  c=cfg.get(platform,{})
  add(c.get('test_recipient'))
  for v in c.get('blocked_contact_ids',[]):add(v)
 for key,group in cfg.get('qq_groups',{}).items():add(key);add(group.get('name'))
 sync=root/'sync.json'
 if sync.exists():
  repo=json.loads(sync.read_text()).get('repository','');add(repo)
  if '/' in repo:add(repo.split('/')[0])
 add(str(Path.home()));add(str(root.resolve()))
 secret_dir=Path.home()/'.dsh/secrets'
 if secret_dir.exists():
  for p in secret_dir.iterdir():
   if p.is_file():
    try:add(p.read_text().strip())
    except (UnicodeError,OSError):pass
 return values

def audit(directory, denied):
 issues=[]
 for p in sorted(directory.rglob('*')):
  rel=p.relative_to(directory)
  if p.is_symlink() or any(part in EXCLUDED_PARTS for part in rel.parts[:-1]):
   # Only our explicitly generated asset readmes may occupy asset directories.
   if str(rel) not in ('memes/README.md','videos/README.md'):issues.append(str(rel));continue
  if not p.is_file():continue
  text=p.read_text()
  if any(v in text for v in denied):issues.append(str(rel));continue
  if re.search(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)',text):issues.append(str(rel))
 if issues:raise RuntimeError('隐私检查未通过（只列文件名）：'+', '.join(sorted(set(issues))))

def clean_configs(out):
 platform={'daily_likes':None,'daily_comments':100,'daily_private_messages':15,'daily_watch_minutes':30,'daily_posts':1,'autonomous_recipients':False}
 write_json(out/'automation.json',{'owner_qq':'','onebot_url':'http://127.0.0.1:3000','browser_cdp':'http://127.0.0.1:9227',
  'voice':{'provider':'breeze','id':'','model':'breeze-tts-2','instructions':'自然清晰地完整读完全部文字，不省略末尾字词，句尾自然停顿。','max_chars':160,'request_timeout':75,'attempts':2,'queue_expiry_seconds':240},
  'douyin':{**platform,'daily_follows':3,'test_recipient':'','blocked_contact_ids':[]},'xiaohongshu':dict(platform),'qq_groups':{}})
 write_json(out/'interaction-policy.json',{'version':1,'level':0,'nickname':'朋友','quietStart':23,'quietEnd':9})
 write_json(out/'social-planner.json',{'enabled':False,'timeZone':'Asia/Shanghai'})
 write_json(out/'sync.json',{'enabled':False,'repository':'','branch':'main'})
 prompts={
  'qzone':('每日空间说说','先通过 ./qq-api.py get_qzone_msg_list 核对今日记录；明确授权后每天最多发布一条新内容，失败或未知结果不重发。'),
  'browse':('每日资讯','运行 ./hot.sh all，自选一件有趣的内容，仅给主人私聊；无合适内容可不发送。'),
  'douyin-like':('抖音互动','先 ./node-run.sh douyin-act.mjs status 核对专用页和额度；支持推荐流及详情页。仅对已经查看且确实喜欢的当前作品运行 ./node-run.sh douyin-act.mjs like 1。观看额度不足不启动观看、不重置额度。仅在主人明确授权范围内互动；身份或状态不明时停止，不重复调用。'),
  'douyin-post':('抖音发布','先 ./node-run.sh douyin-act.mjs quota。只有主人已提供自己的素材、音色和发布授权，且今天无已发布或待确认作品时才制作。使用 make-video.py 和 publish-video；内容须有完整情节，声明 AI 生成。没有素材或授权就跳过；unknown 不重发。'),
  'xhs-social':('小红书互动','先 ./xhs.sh browse 3 验证滚动和新内容，再通过 ./xhs.sh search 和 read 理解笔记后决定是否互动；只在主人已明确授权的对象、内容和预算范围内使用 xhs-act.mjs、xhs-message.mjs、xhs-share.mjs。收到新回复可自然接话，禁止重复和广告。无授权则跳过。'),
 }
 write_json(out/'automation-schedules.json',[{'key':key,'id':'','title':title,'days':2 if key=='douyin-post' else 1,'startMinute':600,'endMinute':1320,'enabled':False,'sessionId':'','chatId':'','prompt':prompt+' 遵守 SOCIAL_POLICY.md；任务由插件续期，不另建提醒，运营通知仅给主人。'} for key,(title,prompt) in prompts.items()])
 (out/'.share-edition').write_text('clean-source-v1\n')
 (out/'.gitignore').write_text('node_modules/\n.state/\n.migration/\n.runtime/\n__pycache__/\n*.pyc\n*.log\n*.zip\n*.tar.gz\n*.key\n*.token\n.env*\nchecks/\nmemes/*\n!memes/README.md\nvideos/*\n!videos/README.md\n.DS_Store\n')

def build(root, destination):
 root=Path(root).resolve();destination=Path(destination).resolve()
 if destination.exists():raise FileExistsError('目标文件已存在，请使用新文件名')
 denied=private_values(root)
 with tempfile.TemporaryDirectory(prefix='dsh-share-') as temp:
  out=Path(temp)/'DSH-Automation-Share';out.mkdir()
  sources=[root/p for p in sorted(ROOT_FILES)]
  for folder in SOURCE_DIRS:
   sources.extend(p for p in sorted((root/folder).rglob('*')) if p.is_file() and p.suffix in SOURCE_SUFFIXES and not any(x in EXCLUDED_PARTS for x in p.relative_to(root).parts) and str(p.relative_to(root))!='migrate/MIGRATE.md')
  for p in sources:
   if p.is_symlink():raise RuntimeError('源码不允许符号链接：'+str(p.relative_to(root)))
   target=out/p.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True)
   # Keep the exporter intact: it must still scrub the original presentation names.
   target.write_text(p.read_text() if p==root/'share/export.py' else public_text(p.read_text()))
   target.chmod(0o755 if p.suffix in {'.sh','.command','.py'} else 0o644)
  for p in sorted((root/'share/templates').rglob('*')):
   if p.is_file():
    target=out/p.relative_to(root/'share/templates');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
    target.chmod(0o755 if p.suffix in {'.sh','.command','.py'} else 0o644)
  clean_configs(out)
  audit(out,denied)
  files={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
  write_json(out/'MANIFEST.json',{'format':1,'edition':'clean-source','files':files})
  write_json(out/'PRIVACY-CHECK.json',{'passed':True,'strategy':'source allowlist + fresh configs + local private-value scan','files_checked':len(files),'excluded':['accounts','tokens and API keys','browser profiles and cookies','chat history and memories','runtime ledgers and logs','private Git history and encrypted vault','personal media and voice assets'],'automatic_tasks_enabled':False})
  destination.parent.mkdir(parents=True,exist_ok=True)
  with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
   for p in sorted(out.rglob('*')):
    if p.is_file():z.write(p,p.relative_to(out.parent))
 return {'archive':str(destination),'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'files':len(files)+2,'privacy':'passed'}

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 print(json.dumps(build(ROOT,args.output),ensure_ascii=False,indent=2))
