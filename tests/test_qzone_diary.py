import importlib.util,json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'lib'))
import qzone_diary as diary
module=importlib.util.spec_from_file_location('qzone_cli',ROOT/'qzone.py')
cli=importlib.util.module_from_spec(module);module.loader.exec_module(cli)

class QzoneTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name)
  self.date=diary.today();self.state=self.root/'.state';self.state.mkdir()
  (self.state/'group-attention-acceptance.json').write_text(json.dumps({'at':self.date+'T10:00:00+08:00'}))
  self.parts=['今天名字又多了一个：锅爷。小伴、霍霍、祸爷，排到最后忽然像开了个小厨房。','以前听漏了叫我的话，现在能把话接住，我反而挺在意这种小事。','比起反复介绍自己是什么人设，我更想让人觉得：叫一声，我在。']
  self.spec={'date':self.date,'format':'gallery','angle':'小事日记','title':'今天多了个名字','content':''.join(self.parts),'reflection':self.parts[-1],'source_ids':['nicknames-'+self.date],'panels':self.parts}
 def test_grounded_entry_and_all_formats(self):
  facts=diary.evidence(self.root)
  for kind in ('text','image','gallery','voice','video'):
   with self.subTest(kind=kind):diary.validate({**self.spec,'format':kind},facts)
  url='https://example.org/story';facts[0]['text']+=' '+url
  diary.validate({**self.spec,'format':'link','url':url},facts)
  with self.assertRaises(ValueError):diary.validate({**self.spec,'format':'link','url':'https://other.example/story'},facts)
 def test_no_private_or_planned_evidence(self):
  events=self.state/'shared-context/events';events.mkdir(parents=True)
  import time
  for scope,status,role in [('owner','observed','activity'),('group:qq:123','observed','activity'),('public','planned','activity'),('public','observed','user'),('public','observed-video','activity')]:
   (events/(scope.replace(':','-')+status+role+'.json')).write_text(json.dumps({'scope':scope,'status':status,'role':role,'text':'仅此公开观察可用','at':time.time()*1000}))
  rows=diary.evidence(self.root)
  self.assertEqual(len(rows),2);self.assertEqual(rows[-1]['kind'],'observed-video')
 def test_feed_links_preserved_without_claiming_full_read(self):
  (self.state/'zhihu-browse.json').write_text(json.dumps({'at':self.date+'T10:00:00+08:00','items':[{'title':'公开问题标题','url':'https://www.zhihu.com/question/123'},{'title':'坏链接','url':'https://localhost/private'}]}))
  rows=diary.evidence(self.root);self.assertEqual(len(rows),2)
  self.assertIn('https://www.zhihu.com/question/123',rows[1]['text']);self.assertIn('不代表读完正文',rows[1]['text'])
 def test_bad_or_repeated_drafts_blocked(self):
  facts=diary.evidence(self.root)
  for change in [{'source_ids':['imaginary']},{'date':'2000-01-01'},{'content':self.spec['content']+'别太想我'},{'content':self.spec['content']+'我今天去了公园'},{'reflection':'哈哈'},{'panels':[self.parts[0]]},{'panels':[self.parts[0],self.parts[0]]}]:
   with self.subTest(change=change),self.assertRaises(ValueError):diary.validate({**self.spec,**change},facts)
  with self.assertRaises(ValueError):diary.validate(self.spec,facts,[self.spec])
 def test_sensitive_link_and_image_blocked(self):
  for url in ['http://example.org','https://localhost','https://10.1.2.3/x','https://[::1]/','https://169.254.169.254/','https://example.org/?token=private']:
   with self.subTest(url=url),self.assertRaises(ValueError):diary.public_url(url)
  p=self.root/'private.png';p.write_bytes(b'private')
  with self.assertRaises(ValueError):diary.safe_image(str(p),self.root)
 def run_publish(self,prepared,call):
  with patch.object(cli,'WORKSPACE',self.root),patch.object(cli,'STATE',self.state):return cli.publish(prepared,call=call)
 def test_prepare_gallery_and_once_per_day(self):
  result=diary.prepare(self.spec,self.root);self.assertEqual(len(result['assets']),3)
  from PIL import Image
  with Image.open(result['assets'][0]) as im:self.assertEqual(im.size,(1080,1440))
  calls=[]
  def api(action,payload):
   calls.append(action)
   if action=='get_qzone_msg_list':return {'msglist':[]}
   self.assertEqual(len(payload['images']),3);return {'tid':'confirmed-test'}
  self.assertEqual(self.run_publish(result['prepared'],api)['status'],'confirmed')
  with self.assertRaises(ValueError):self.run_publish(result['prepared'],api)
  self.assertEqual(calls.count('send_qzone_msg'),1)
 def test_remote_today_blocks_and_uncertain_does_not_retry(self):
  result=diary.prepare({**self.spec,'format':'text'},self.root);calls=[]
  def today_api(action,payload):
   calls.append(action);return {'msglist':[{'time':self.date+'T00:00:00+08:00'}]}
  with self.assertRaises(ValueError):self.run_publish(result['prepared'],today_api)
  self.assertEqual(calls,['get_qzone_msg_list'])
  def unknown_api(action,payload):return {'msglist':[]} if action=='get_qzone_msg_list' else {}
  with self.assertRaises(ValueError):self.run_publish(result['prepared'],unknown_api)
  self.assertEqual(diary.read(self.state/'qzone.json')['status'],'unknown')
  with self.assertRaises(ValueError):self.run_publish(result['prepared'],unknown_api)
 def test_changed_assets_blocked_before_remote_call(self):
  result=diary.prepare(self.spec,self.root);pathlib.Path(result['assets'][0]).write_bytes(b'changed')
  def no_api(*args):self.fail('must not contact API')
  with self.assertRaises((ValueError,OSError)):self.run_publish(result['prepared'],no_api)
 def test_changed_spec_or_missing_asset_hash_blocked(self):
  result=diary.prepare(self.spec,self.root);p=pathlib.Path(result['prepared']);data=json.loads(p.read_text());data['spec']['title']='换个标题';p.write_text(json.dumps(data))
  def no_api(*args):self.fail('must not contact API')
  with self.assertRaises(ValueError):self.run_publish(p,no_api)
  data['spec']=self.spec;data['hashes']={};p.write_text(json.dumps(data))
  with self.assertRaises(ValueError):self.run_publish(p,no_api)
 def test_unavailable_native_publisher_never_degrades(self):
  spec={**self.spec,'format':'video'};digest=diary.spec_id(spec);p=self.state/'qzone-diary'/digest/'prepared.json';p.parent.mkdir(parents=True)
  p.write_text(json.dumps({'id':digest,'spec':spec,'status':'awaiting-native-publisher'}))
  with self.assertRaises(ValueError):self.run_publish(p,lambda *a:self.fail('must not publish text'))
