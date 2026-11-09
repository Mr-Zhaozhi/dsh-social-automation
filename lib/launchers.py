"""Portable desktop launchers. No compiler and no QQ bundle modifications."""
import plistlib,shlex,shutil,sys
from pathlib import Path

def install(root,home=None,python=None):
 root=Path(root).resolve();home=Path.home() if home is None else Path(home);python=python or sys.executable
 desktop=home/'Desktop';desktop.mkdir(parents=True,exist_ok=True)
 personal=home/'Applications/QQ-MAS.app'
 specs=[('个人 QQ','personal',f'test -d {shlex.quote(str(personal))} || {{ /usr/bin/osascript -e \'display alert "请先安装个人 QQ-MAS 到 ~/Applications/QQ-MAS.app"\'; exit 1; }}\nexec /usr/bin/open -n {shlex.quote(str(personal))}\n'),('小伴机器人','bot',f'cd {shlex.quote(str(root))}\n/usr/bin/open -a "DSH Desktop"\nexec {shlex.quote(str(python))} lib/bot.py start --recover\n')]
 for title,key,script in specs:
  bundle=desktop/(title+'.app');contents=bundle/'Contents';info=contents/'Info.plist';identifier='local.huohuo.launcher.'+key
  if bundle.exists() and (not info.exists() or plistlib.loads(info.read_bytes()).get('CFBundleIdentifier')!=identifier):raise RuntimeError('桌面存在同名非本项目应用，未覆盖：'+str(bundle))
  (contents/'MacOS').mkdir(parents=True,exist_ok=True);(contents/'Resources').mkdir(exist_ok=True)
  icon=root/'assets/launchers'/f'{key}.icns'
  if icon.exists():shutil.copy2(icon,contents/'Resources/icon.icns')
  info.write_bytes(plistlib.dumps({'CFBundleName':title,'CFBundleDisplayName':title,'CFBundleIdentifier':identifier,'CFBundleExecutable':'launch','CFBundleIconFile':'icon.icns','CFBundlePackageType':'APPL','CFBundleVersion':'2','LSUIElement':True}))
  executable=contents/'MacOS/launch';executable.write_text('#!/bin/bash\nset -e\n'+script);executable.chmod(0o755)
 return {'desktop':str(desktop),'personalQQInstalled':personal.exists()}
if __name__=='__main__':print(install(Path(__file__).resolve().parent.parent))
