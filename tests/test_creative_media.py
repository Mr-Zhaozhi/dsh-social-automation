import unittest,tempfile,json,sys,socket
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import creative_media as m
from video_editorial import assets_for
class MediaTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.root=Path(self.t.name).resolve()
  self.p=self.root/'assets/external/test.png';self.p.parent.mkdir(parents=True);self.p.write_bytes(b'fixture-image')
  m.register(self.p,{'license':'CC-BY','credit':'作者测试','source_page':'https://example.org/photo'},self.root)
  self.spec={'prompt':'镜头缓慢向前推进，保持首帧结构。','image':str(self.p),'duration':5,'resolution':'1080p'}
 def test_attribution_and_hash_binding(self):
  with self.assertRaisesRegex(ValueError,'署名'):assets_for({'assets':[str(self.p)],'description':'AI创作'},self.root)
  self.assertEqual(assets_for({'assets':[str(self.p)],'description':'AI创作 作者测试'},self.root),[self.p])
  self.p.write_bytes(b'changed')
  with self.assertRaises(ValueError):m.resolve(self.p,self.root)
 def test_create_reuses_task_and_enforces_daily_cap(self):
  with patch.object(m,'api',return_value={'id':'task-1'}) as api:
   a=m.create(self.spec,self.root);b=m.create(self.spec,self.root);self.assertEqual(a,b);self.assertEqual(api.call_count,1)
   body=api.call_args.kwargs['body'];self.assertEqual(body['model'],m.MODEL);self.assertTrue(body['watermark']);self.assertEqual(body['duration'],5)
   for i in [2,3]:m.create({**self.spec,'prompt':self.spec['prompt']+str(i)},self.root)
   with self.assertRaisesRegex(ValueError,'最多'):m.create({**self.spec,'prompt':self.spec['prompt']+'4'},self.root)
   self.assertEqual(api.call_count,3)
 def test_unknown_submit_does_not_retry(self):
  with patch.object(m,'api',side_effect=TimeoutError) as api:
   with self.assertRaises(TimeoutError):m.create(self.spec,self.root)
   self.assertEqual(m.create(self.spec,self.root)['status'],'unknown');self.assertEqual(api.call_count,1)
 def test_private_address_rejected_before_download(self):
  with patch.object(socket,'getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
   with self.assertRaises(ValueError):m.public_url('https://example.org/a.png')
 def test_finished_job_downloads_once_and_keeps_input_credit(self):
  with patch.object(m,'api',return_value={'id':'task-1'}):job=m.create(self.spec,self.root)
  def download(url,p,*a):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'video-fixture')
  with patch.object(m,'api',return_value={'status':'succeeded','content':{'video_url':'https://example.org/out.mp4'}}) as api,patch.object(m,'download',side_effect=download) as dl:
   r=m.status(job['local_id'],self.root);self.assertEqual(m.status(job['local_id'],self.root),r);self.assertEqual(dl.call_count,1);self.assertEqual(api.call_count,1)
  meta=json.loads((self.root/r['file']).with_suffix('.mp4.source.json').read_text());self.assertEqual(meta['credit'],'作者测试');self.assertEqual(meta['license'],'CC-BY')
