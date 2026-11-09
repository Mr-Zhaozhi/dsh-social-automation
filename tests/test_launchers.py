import importlib.util,plistlib,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/'lib'/f'{name}.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class LauncherTests(unittest.TestCase):
 def test_portable_install_and_reinstall(self):
  with tempfile.TemporaryDirectory(prefix='new mac ') as t:
   home=Path(t);m=module('launchers');m.install(ROOT,home,'/custom path/python3');m.install(ROOT,home,'/custom path/python3')
   p=home/'Desktop/小伴机器人.app/Contents';script=(p/'MacOS/launch').read_text();self.assertIn("'/custom path/python3'",script);self.assertFalse((p/'Resources/icon.icns').exists())
   self.assertEqual(plistlib.loads((p/'Info.plist').read_bytes())['CFBundleIdentifier'],'local.huohuo.launcher.bot')
   self.assertIn(str(home),(home/'Desktop/个人 QQ.app/Contents/MacOS/launch').read_text())
 def test_background_hook_is_idempotent_and_preserves_loader(self):
  with tempfile.TemporaryDirectory() as t:
   home=Path(t);p=home/'Library/Containers/com.tencent.qq/Data/Documents/loadNapCat.js';p.parent.mkdir(parents=True);p.write_text('const loadNapcat = true;\n')
   m=module('qq_background');m.install(home);m.install(home);self.assertEqual(p.read_text().count(m.MARK),1);self.assertTrue(p.with_suffix('.js.before-dock-hide').exists())
