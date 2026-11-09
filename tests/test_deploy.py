import importlib.util,json,tempfile,unittest,zipfile,hashlib,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'share/deploy_install.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
spec=importlib.util.spec_from_file_location('exporter',ROOT/'share/export.py');exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)

class DeploymentTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='新用户 setup ');self.home=Path(self.temp.name)/'home';self.workspace=Path(self.temp.name)/'workspace';self.workspace.mkdir();exporter.clean_configs(self.workspace)
 def tearDown(self):self.temp.cleanup()
 def test_fresh_credentials_and_group_voice_scope_are_consistent(self):
  result=deploy.configure(self.home,self.workspace,'19000001','19000002')
  token=result['token_file'].read_text().strip();self.assertGreater(len(token),20);self.assertEqual(result['token_file'].stat().st_mode&0o777,0o600)
  net=json.loads(result['napcat_config'].read_text())['network'];self.assertEqual(net['httpServers'][0]['token'],token);self.assertEqual(net['websocketClients'][0]['token'],token)
  patch=(result['harness']/'profiles/web/cordis.patch.yml').read_text();self.assertIn('"memberTools": "all"',patch);self.assertIn('"restrictedMemberPrefix": false',patch);self.assertIn('"adminUsers": ["19000001"]',patch)
  self.assertTrue(all(not r['enabled'] for r in json.loads((self.workspace/'automation-schedules.json').read_text())))
  self.assertFalse(json.loads((self.workspace/'social-planner.json').read_text())['enabled'])
  deploy.configure(self.home,self.workspace,'19000001','19000002');self.assertEqual(result['token_file'].read_text().strip(),token)
  self.assertEqual((result['harness']/'profiles/web/cordis.patch.yml').read_text().count('# DSH_SHARED_DEPLOY_CONFIG'),1)
 def test_existing_identity_or_plugin_settings_are_not_overwritten(self):
  deploy.configure(self.home,self.workspace,'19000001','19000002')
  for pair in [('19000003','19000002'),('19000001','19000003')]:
   with self.assertRaises(RuntimeError):deploy.configure(self.home,self.workspace,*pair)
  other=self.home/'other';patch=other/'Library/Application Support/dsh-desktop/harness/profiles/web/cordis.patch.yml';patch.parent.mkdir(parents=True);patch.write_text('- id: dsh-onebot\n  config: {}\n')
  with self.assertRaises(RuntimeError):deploy.configure(other,self.workspace,'19000001','19000002')
  self.assertFalse((other/'.dsh/secrets').exists())
 def test_invalid_or_same_accounts_never_write_credentials(self):
  for pair in [('abc','19000002'),('19000001','19000001')]:
   with self.assertRaises(ValueError):deploy.configure(self.home,self.workspace,*pair)
  self.assertFalse(self.home.exists())
 def test_tampered_component_and_zip_escape_are_rejected(self):
  p=self.workspace/'part';p.write_bytes(b'component');item={'hash':hashlib.sha256(p.read_bytes()).hexdigest()};deploy.verify_component(p,item);p.write_bytes(b'changed')
  with self.assertRaises(RuntimeError):deploy.verify_component(p,item)
  z=self.workspace/'bad.zip'
  with zipfile.ZipFile(z,'w') as f:f.writestr('../outside','bad')
  with self.assertRaises(RuntimeError):deploy.extract_zip(z,self.workspace/'out')
  self.assertFalse((self.workspace/'out').exists())
  p.write_bytes(b'component');(self.workspace/'MANIFEST.json').write_text(json.dumps({'files':{'part':item['hash']}}));deploy.verify_source(self.workspace)
  p.write_bytes(b'modified')
  with self.assertRaises(RuntimeError):deploy.verify_source(self.workspace)
 def test_active_automation_cannot_be_silently_reinstalled(self):
  deploy.configure(self.home,self.workspace,'19000001','19000002');p=self.workspace/'social-planner.json';p.write_text('{"enabled":true}')
  with self.assertRaises(RuntimeError):deploy.configure(self.home,self.workspace,'19000001','19000002')
 @unittest.skipUnless(__import__('sys').platform=='darwin','macOS metadata')
 def test_finder_cleanup_keeps_quarantine_and_signed_contents(self):
  app=self.workspace/'Example.app';app.mkdir();p=app/'binary';p.write_bytes(b'signed contents')
  subprocess.run(['/usr/bin/xattr','-wx','com.apple.FinderInfo','01'+'00'*31,str(p)],check=True)
  subprocess.run(['/usr/bin/xattr','-w','com.apple.quarantine','0081;00000000;DSH-Unit-Test;',str(p)],check=True)
  deploy.clear_finder_metadata(app)
  attrs=subprocess.check_output(['/usr/bin/xattr',str(p)],text=True)
  self.assertEqual(p.read_bytes(),b'signed contents');self.assertNotIn('com.apple.FinderInfo',attrs);self.assertIn('com.apple.quarantine',attrs)

if __name__=='__main__':unittest.main()
