import hashlib, importlib.util, json, os, plistlib, shutil, subprocess, sys, tempfile, unittest, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('share_export',ROOT/'share/export.py');export=importlib.util.module_from_spec(spec);spec.loader.exec_module(export)

class SharedSourceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory(prefix='共享源码 测试 ');cls.base=Path(cls.temp.name)
  cls.archive=cls.base/'share.zip';export.build(ROOT,cls.archive)
  with zipfile.ZipFile(cls.archive) as z:z.extractall(cls.base)
  cls.bundle=cls.base/'DSH-Automation-Share'
 @classmethod
 def tearDownClass(cls):cls.temp.cleanup()
 def test_no_private_runtime_and_valid_manifest(self):
  with zipfile.ZipFile(self.archive) as z:
   names=z.namelist()
   for name in names:
    self.assertFalse(any(part in {'.git','.state','vault','node_modules','profiles','sessions','checks'} for part in Path(name).parts))
    self.assertNotIn(Path(name).suffix,{'.key','.token','.db','.sqlite','.png','.gif','.mp4','.wav'})
  manifest=json.loads((self.bundle/'MANIFEST.json').read_text())
  for name,digest in manifest['files'].items():self.assertEqual(hashlib.sha256((self.bundle/name).read_bytes()).hexdigest(),digest,name)
  export.audit(self.bundle,export.private_values(ROOT))
 def test_blank_accounts_and_inactive_defaults(self):
  cfg=json.loads((self.bundle/'automation.json').read_text());self.assertEqual(cfg['owner_qq'],'');self.assertEqual(cfg['voice']['id'],'');self.assertEqual(cfg['qq_groups'],{})
  self.assertTrue(all(not r['enabled'] and not r['id'] and not r['sessionId'] for r in json.loads((self.bundle/'automation-schedules.json').read_text())))
  self.assertFalse(json.loads((self.bundle/'social-planner.json').read_text())['enabled'])
  self.assertFalse(json.loads((self.bundle/'sync.json').read_text())['enabled'])
  self.assertEqual(json.loads((self.bundle/'interaction-policy.json').read_text())['level'],0)
 def test_initializer_and_session_binding_do_not_enable_tasks(self):
  with tempfile.TemporaryDirectory(prefix='初始化 空格 ') as tmp:
   root=Path(tmp)/'source';shutil.copytree(self.bundle,root);home=Path(tmp)/'home';harness=home/'harness'
   env={**os.environ,'HUOHUO_HOME':str(home),'DSH_HOME':str(harness)}
   run=lambda *args:subprocess.run([sys.executable,str(root/'初始化配置.py'),*args],env=env,capture_output=True,text=True)
   self.assertEqual(run('--owner-qq','19000001').returncode,0)
   self.assertNotEqual(run('--bind-session').returncode,0)
   mapping=harness/'media/onebot/chat-sessions.json';mapping.parent.mkdir(parents=True);mapping.write_text(json.dumps({'private:19000001':{'session':'onebot-private-19000001-test'}}))
   result=run('--bind-session');self.assertEqual(result.returncode,0,result.stderr)
   rules=json.loads((root/'automation-schedules.json').read_text());self.assertTrue(all(not r['enabled'] and r['sessionId']=='onebot-private-19000001-test' for r in rules))
   self.assertFalse((home/'.dsh/secrets').exists());self.assertFalse((root/'.state').exists())
   self.assertNotEqual(run('--owner-qq','19000002').returncode,0)
 def test_private_value_and_secret_patterns_fail_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p=root/'data.txt';p.write_text('private-fixture-value')
   with self.assertRaises(RuntimeError):export.audit(root,{'private-fixture-value'})
   p.write_text('gh'+'p_'+'a'*30)
   with self.assertRaises(RuntimeError):export.audit(root,set())
 def test_installer_does_not_overwrite_missing_or_other_workspace(self):
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp)/'home';harness=home/'harness'
   env={**os.environ,'HUOHUO_WORKSPACE':str(self.bundle),'HUOHUO_HOME':str(home),'DSH_HOME':str(harness)}
   run=lambda:subprocess.run([sys.executable,str(self.bundle/'lib/setup.py'),'--no-launch'],env=env,capture_output=True,text=True)
   self.assertNotEqual(run().returncode,0);self.assertFalse(home.exists())
   patch=harness/'profiles/web/cordis.patch.yml';patch.parent.mkdir(parents=True);patch.write_text('[]\n')
   for name in ['dsh-onebot-qq','dsh-douyin-browser-local']:
    p=patch.parent/'node_modules'/name/'package.json';p.parent.mkdir(parents=True);p.write_text('{}')
   service=home/'Library/LaunchAgents/com.huohuo.voice.plist';service.parent.mkdir(parents=True);data=plistlib.dumps({'WorkingDirectory':'/private/another-workspace'});service.write_bytes(data)
   result=run();self.assertNotEqual(result.returncode,0);self.assertIn('已有另一工作区',result.stderr);self.assertEqual(service.read_bytes(),data);self.assertEqual(patch.read_text(),'[]\n')

if __name__=='__main__':unittest.main()
