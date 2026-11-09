import hashlib,json,shutil,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from material_library import catalog,search,summary,resolve_material
from install_stickers import install
from qzone_diary import safe_image
from video_editorial import assets_for
ROOT=Path(__file__).resolve().parents[1]

@unittest.skipUnless((ROOT/"assets/huohuo-life/catalog.json").exists(), "Private character fixtures are intentionally not distributed")
class MaterialLibraryTests(unittest.TestCase):
 def test_all_sources_preserved_and_original_bytes_verified(self):
  from PIL import Image
  data=catalog(ROOT);self.assertEqual(len(data['assets']),70)
  ids=set()
  for row in data['assets']:
   self.assertNotIn(row['id'],ids);ids.add(row['id'])
   p=ROOT/row['file'];self.assertTrue(p.resolve().is_relative_to(ROOT));self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),row['sha256'])
   with Image.open(p) as im:self.assertEqual((im.width,im.height,im.n_frames),(row['width'],row['height'],row['frames']))
  mapping=json.loads((ROOT/'assets/huohuo-life/source-map.json').read_text())['files'];self.assertEqual(len(mapping),70)
  for row in mapping:self.assertEqual(hashlib.sha256((ROOT/row['repository']).read_bytes()).hexdigest(),row['sha256'])

 def test_search_scene_and_animation_separately_without_reference_duplicates(self):
  food=search('火锅',root=ROOT);self.assertEqual(len(food),2);self.assertTrue(all(r['category']=='daily/food' for r in food))
  animations=search(category='stickers/animated',root=ROOT);self.assertEqual(len(animations),4);self.assertTrue(all(r['frames']>1 for r in animations))
  self.assertEqual(search('根本没有这个关键词xyz',root=ROOT),[])
  self.assertEqual(sum(summary(ROOT)['categories'].values()),41)
  self.assertFalse(any(r['category']=='reference' for r in search(limit=30,root=ROOT)))

 def test_qzone_and_video_accept_registered_files_only_and_preserve_gif_rules(self):
  photo=search('火锅',root=ROOT)[0]['file'];gif=search(category='stickers/animated',root=ROOT)[0]['file']
  self.assertEqual(safe_image(photo,ROOT),str(ROOT/photo))
  self.assertEqual(assets_for({'assets':[photo,gif]},ROOT),[ROOT/photo,ROOT/gif])
  with self.assertRaises(ValueError):safe_image(gif,ROOT)
  for value in ['../outside.png','assets/unknown.png',next(r['file'] for r in catalog(ROOT)['assets'] if r['category']=='reference')]:
   with self.assertRaises(ValueError):resolve_material(value,ROOT,allow_gif=True)

 def test_new_computer_uses_local_paths_and_rejects_corruption(self):
  row=next(r for r in catalog(ROOT)['assets'] if r['category']=='daily/food')
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);dst=root/row['file'];dst.parent.mkdir(parents=True);shutil.copyfile(ROOT/row['file'],dst)
   index=root/'assets/huohuo-life/catalog.json';index.parent.mkdir(parents=True,exist_ok=True);index.write_text(json.dumps({'categories':{},'assets':[row]}))
   self.assertEqual(resolve_material(row['file'],root),str(dst.resolve()))
   dst.write_bytes(b'wrong bytes')
   with self.assertRaisesRegex(ValueError,'校验失败'):resolve_material(row['file'],root)

 def test_fresh_install_registers_only_35_unique_stickers_and_keeps_gif_bytes(self):
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp);install(ROOT,home);install(ROOT,home)
   settings=json.loads((home/'.dsh/dsh-expression.json').read_text());self.assertIn('huohuo-life',settings['enabledPacks'])
   total=0
   for name,expected in [('huohuo-v3',28),('huohuo-life',7)]:
    folder=home/'.dsh/meme-packs'/name
    with sqlite3.connect(folder/'index.db') as db:
     rows=db.execute('select path,caption,keywords from memes').fetchall();self.assertEqual(len(rows),expected);total+=len(rows)
    for row in json.loads((ROOT/'assets/stickers'/name/'catalog.json').read_text())['images']:
     dest=folder/'memes'/row['tag']/Path(row['file']).name;self.assertEqual(hashlib.sha256(dest.read_bytes()).hexdigest(),row['sha256'])
   self.assertEqual(total,35)
