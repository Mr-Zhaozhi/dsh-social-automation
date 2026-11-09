import importlib.util,json,tempfile,unittest,hashlib
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('kit',Path(__file__).resolve().parents[1]/'migrate/kit.py');kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
class MigrationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.kit=self.root/'kit';self.kit.mkdir();self.home=self.root/'new user';
  files={'workspace/automation-schedules.json':json.dumps([{'enabled':True}]),'workspace/AGENTS.md':'/Users/old/Documents/huohuo-qq/memes/asset.png','harness/storages/schedule.json':json.dumps({'unit':{'name':'schedule','version':1},'global':None,'tables':{'tasks':{'old':{'status':'active','record':{'id':'old'}}}}})}
  for n,v in files.items():p=self.kit/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(v)
  (self.kit/'manifest.json').write_text(json.dumps({'version':2,'source_home':'/Users/old','source_workspace':'/Users/old/Documents/huohuo-qq','source_arch':'x86_64','files':{n:kit.digest(self.kit/n) for n in files}}))
 def tearDown(self):self.tmp.cleanup()
 def test_restore_relocates_and_pauses(self):
  kit.restore(self.kit,self.home)
  w=self.home/'Documents/huohuo-qq';self.assertIn(str(w),(w/'AGENTS.md').read_text());self.assertFalse(json.loads((w/'automation-schedules.json').read_text())[0]['enabled'])
  s=json.loads((self.home/'Library/Application Support/dsh-desktop/harness/storages/schedule.json').read_text());self.assertEqual(s['tables']['tasks']['old']['status'],'inactive')
 def test_dry_run_has_no_writes(self):kit.restore(self.kit,self.home,True);self.assertFalse(self.home.exists())
 def test_executable_python_keeps_execute_permission(self):
  p=self.kit/'workspace/qq-api.py';p.write_text('#!/usr/bin/env python3\n');p.chmod(0o700)
  m=json.loads((self.kit/'manifest.json').read_text());m['files']['workspace/qq-api.py']=kit.digest(p);(self.kit/'manifest.json').write_text(json.dumps(m))
  kit.restore(self.kit,self.home);self.assertTrue((self.home/'Documents/huohuo-qq/qq-api.py').stat().st_mode & 0o100)
 def test_native_automations_import_paused(self):
  m=json.loads((self.kit/'manifest.json').read_text())
  for name in ['watch-schedule-policy.json','video-policy.json','chat-policy.json','share-policy.json','friend-interactions-policy.json']:
   p=self.kit/'plugin-state/dsh-douyin-browser-local'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps({'version':1,'enabled':True}));m['files'][str(p.relative_to(self.kit))]=kit.digest(p)
  (self.kit/'manifest.json').write_text(json.dumps(m));kit.restore(self.kit,self.home)
  for p in (self.home/'Documents/huohuo-qq/.migration/plugin-state/dsh-douyin-browser-local').glob('*.json'):self.assertFalse(json.loads(p.read_text())['enabled'])
 def test_tamper_rejected_before_writes(self):
  (self.kit/'workspace/AGENTS.md').write_text('tampered')
  with self.assertRaises(RuntimeError):kit.restore(self.kit,self.home)
  self.assertFalse(self.home.exists())
 def test_existing_task_wins_and_is_backed_up(self):
  p=self.home/'Library/Application Support/dsh-desktop/harness/storages/schedule.json';p.parent.mkdir(parents=True);p.write_text(json.dumps({'tables':{'tasks':{'old':{'status':'active','record':{'id':'old','title':'existing'}}}}}))
  kit.restore(self.kit,self.home);self.assertEqual(json.loads(p.read_text())['tables']['tasks']['old']['record']['title'],'existing');self.assertTrue(list((self.home/'Documents/huohuo-restore-backups').rglob('schedule.json')))
if __name__=='__main__':unittest.main()
