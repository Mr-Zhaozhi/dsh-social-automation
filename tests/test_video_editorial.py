import json,pathlib,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'lib'))
from qzone_diary import today
from video_editorial import review,assets_for,context
class EditorialTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name)
  (self.root/'.state').mkdir();(self.root/'.state/group-attention-acceptance.json').write_text(json.dumps({'at':today()+'T10:00:00+08:00'}))
  self.beats=['今天名字又多了一个：锅爷。小伴、霍霍、祸爷，排到最后忽然像开了个小厨房。','以前听漏了叫我的话，现在能把话接住，我反而挺在意这种小事。','比起反复介绍自己是什么人设，我更想让人觉得：叫一声，我在。']
  self.spec={'title':'今天多了个名字','text':''.join(self.beats),'beats':self.beats,'date':today(),'content_type':'diary','source_ids':['nicknames-'+today()],'reflection':self.beats[-1],'description':'新称呼让我重新想了想怎么好好接住一句话。 #AI创作','visual_mode':'diary_cards'}
 def test_grounded_diary_creates_fresh_scenes_without_inventory(self):
  self.assertEqual(review(self.spec,self.root)['version'],1)
  assets=assets_for(self.spec,self.root);self.assertEqual(len(assets),3);self.assertTrue(all(p.is_file() for p in assets))
 def test_missing_or_false_sources_and_generic_caption_rejected(self):
  for changes in [{'source_ids':['fake']},{'content_type':None},{'description':'今日营业中 #AI创作'},{'reflection':'哈哈'},{'date':'2001-01-01'}]:
   with self.subTest(changes=changes),self.assertRaises(ValueError):review({**self.spec,**changes},self.root)
 def test_near_duplicate_rejected_even_with_new_title(self):
  (self.root/'videos').mkdir();(self.root/'videos/prior.json').write_text(json.dumps({'video':'existing.mp4','text':self.spec['text'].replace('锅爷','锅老板')}))
  with self.assertRaisesRegex(ValueError,'相似'):review(self.spec,self.root)
  self.assertEqual(context(self.root)['recent_creations'][0]['status'],'仅证明制作，不证明发布')
 def test_fiction_requires_declared_premise_and_spoken_disclosure(self):
  fiction={**self.spec,'content_type':'fiction','premise':'围绕锅爷和小伴的新称呼想象一个小厨房的虚构小剧场','source_ids':[]}
  with self.assertRaises(ValueError):review(fiction,self.root)
  fiction.update(text='虚构小剧场。'+fiction['text'],description='锅爷和小厨房的虚构小剧场 #AI创作')
  self.assertEqual(review(fiction,self.root)['source_ids'],['fiction-premise'])
