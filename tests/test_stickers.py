import hashlib,json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from install_stickers import install
ROOT=Path(__file__).resolve().parents[1]

class StickerTests(unittest.TestCase):
 def test_install_idempotent_and_preserves_other_packs_and_manual_disable(self):
  if not (ROOT/'assets/stickers/huohuo-v3/catalog.json').exists():self.skipTest('personal assets not included')
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp);settings=home/'.dsh/dsh-expression.json';settings.parent.mkdir();settings.write_text(json.dumps({'enabledPacks':['existing'],'sendGear':'active'}))
   install(ROOT,home);install(ROOT,home)
   self.assertEqual(json.loads(settings.read_text())['enabledPacks'],['existing',*[p.parent.name for p in sorted((ROOT/'assets/stickers').glob('*/catalog.json'))]])
   folder=home/'.dsh/meme-packs/huohuo-v3'
   with sqlite3.connect(folder/'index.db') as db:
    rows=db.execute('select path,caption,keywords from memes').fetchall();self.assertEqual(len(rows),28)
   catalog=json.loads((ROOT/'assets/stickers/huohuo-v3/catalog.json').read_text());expected={Path(r['file']).name:r['sha256'] for r in catalog['images']}
   for path,caption,keywords in rows:
    self.assertTrue(caption and keywords);self.assertEqual(hashlib.sha256((folder/path).read_bytes()).hexdigest(),expected[Path(path).name])
   self.assertEqual(sum(p.endswith('.gif') for p,_,_ in rows),4)
   settings.write_text(json.dumps({'enabledPacks':['existing'],'sendGear':'active'}));install(ROOT,home)
   self.assertEqual(json.loads(settings.read_text())['enabledPacks'],['existing'])
