import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'lib'))
from setup_stt import configure
class SpeechSetupTests(unittest.TestCase):
 def test_configure_is_idempotent_preserves_other_plugins_and_credentials(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'new mac';patch=Path(tmp)/'patch.yml';patch.write_text('- id: dsh-onebot\n  config:\n    accessToken: fixture-token\n    sttEngine: auto\n- id: unrelated\n  config:\n    enabled: true\n')
   configure(patch,root);first=patch.read_text();configure(patch,root)
   self.assertEqual(first,patch.read_text());self.assertIn('fixture-token',first);self.assertIn('- id: unrelated',first);self.assertEqual(first.count('sttEngine:'),1)
   args=json.loads(next(line.split(': ',1)[1] for line in first.splitlines() if 'sttArgs:' in line));self.assertEqual(args[0],str(root/'lib/stt.py'));self.assertIn('{file}',args)
 def test_ambiguous_configuration_is_not_overwritten(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'patch';before='- id: other\n  config: {}\n';p.write_text(before)
   with self.assertRaises(RuntimeError):configure(p,Path(tmp))
   self.assertEqual(p.read_text(),before)
 def test_all_asr_components_are_pinned_for_both_chips(self):
  items=json.loads((ROOT/'share/components.json').read_text())['components']
  self.assertEqual({i['arch'] for i in items if i['kind']=='ffprobe'},{'x64','arm64'})
  self.assertEqual(len([i for i in items if i['kind']=='asr-model']),1)
  for i in items:
   if i['kind'] in ['ffprobe','asr-model']:self.assertEqual(len(i['hash']),64)
if __name__=='__main__':unittest.main()
