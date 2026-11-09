#!/usr/bin/env python3
"""Initialize only a clean shared workspace. Does not enable outbound tasks."""
import argparse, getpass, json, os, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def save(path,value):
 temp=path.with_name(path.name+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.chmod(0o600);temp.replace(path)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--owner-qq');p.add_argument('--nickname',default='朋友');p.add_argument('--voice-id',default='');p.add_argument('--secrets',action='store_true');p.add_argument('--bind-session',action='store_true');a=p.parse_args()
 if not (ROOT/'.share-edition').exists():p.error('仅能在解压后的共享版内运行，不可覆盖已有私人工作区')
 cfg=json.loads((ROOT/'automation.json').read_text());rules=json.loads((ROOT/'automation-schedules.json').read_text())
 home=Path(os.environ.get('HUOHUO_HOME',Path.home()))
 harness=Path(os.environ.get('DSH_HOME',home/'Library/Application Support/dsh-desktop/harness'))
 if a.bind_session:
  owner=str(cfg.get('owner_qq',''))
  if not re.fullmatch(r'[1-9]\d{4,19}',owner):p.error('请先配置主人 QQ')
  mapping=harness/'media/onebot/chat-sessions.json'
  if not mapping.exists():p.error('尚无 QQ 会话映射，请先从主人 QQ 私聊机器人一次')
  entry=json.loads(mapping.read_text()).get('private:'+owner);session=entry if isinstance(entry,str) else (entry or {}).get('session')
  if not session or not session.startswith('onebot-private-'+owner+'-'):p.error('未找到该主人私聊会话，请核对 OneBot 和工作区绑定')
  if any(r.get('enabled') for r in rules):p.error('请先暂停已有定时任务，再重新绑定')
  for r in rules:r.update(sessionId=session,chatId='private:'+owner,id='',enabled=False)
  save(ROOT/'automation-schedules.json',rules);print('主人会话已绑定；所有定时任务仍保持关闭。');return
 owner=a.owner_qq or input('你的 QQ 号（主人账号，不是机器人账号）：').strip()
 if not re.fullmatch(r'[1-9]\d{4,19}',owner):p.error('QQ 号须为 5–20 位数字，且不能以 0 开头')
 if cfg.get('owner_qq') and cfg['owner_qq']!=owner:p.error('已有其他主人，请使用一份全新解压的共享包')
 if a.voice_id and not re.fullmatch(r'voc_[A-Za-z0-9_-]+',a.voice_id):p.error('请填写自己的 Breeze 音色 ID')
 if any(r.get('enabled') for r in rules):p.error('已有启用的定时任务，请暂停后再配置')
 cfg['owner_qq']=owner
 if a.voice_id:cfg['voice']['id']=a.voice_id
 save(ROOT/'automation.json',cfg)
 policy=json.loads((ROOT/'interaction-policy.json').read_text());policy['nickname']=a.nickname;save(ROOT/'interaction-policy.json',policy)
 if a.secrets:
  directory=home/'.dsh/secrets';directory.mkdir(parents=True,exist_ok=True,mode=0o700)
  for filename,label in [('onebot.token','自己的 OneBot HTTP Token'),('breeze.key','自己的 Breeze API Key（不用语音可留空）')]:
   target=directory/filename
   if target.exists():print(label+'已存在，保留。');continue
   value=getpass.getpass(label+'：').strip()
   if value:
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(value+'\n')
 print('配置已保存，主动聊天、社交运营和定时任务未启用。下一步请按交付文档完成插件和会话绑定。')

if __name__=='__main__':main()
