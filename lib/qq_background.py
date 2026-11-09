from pathlib import Path
import shutil
MARK='// HUOHUO_BACKGROUND_DOCK_V1'
HOOK='''// HUOHUO_BACKGROUND_DOCK_V1
if (loadNapcat && process.platform === 'darwin') {
  const { app } = require('electron');
  app.whenReady().then(() => {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
    console.log('[huohuo] robot Dock icon hidden');
  }).catch(() => console.error('[huohuo] unable to hide robot Dock icon'));
}
'''
def install(home=None):
 p=(Path.home() if home is None else Path(home))/'Library/Containers/com.tencent.qq/Data/Documents/loadNapCat.js'
 if not p.exists():return False
 s=p.read_text()
 if MARK in s:return True
 if 'const loadNapcat = true;' not in s:raise RuntimeError('QQ loader is not the expected robot mode; unchanged')
 backup=p.with_suffix('.js.before-dock-hide')
 if not backup.exists():shutil.copy2(p,backup)
 p.write_text(s+'\n'+HOOK)
 return True
if __name__=='__main__':print('Robot Dock policy installed:',install())
