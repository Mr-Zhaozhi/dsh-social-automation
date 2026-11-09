import sys,tempfile,unittest,time,json,wave
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import singing
class SingingTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.patch=patch.object(singing,'ROOT',self.root/'state');self.patch.start()
  self.voice=patch.object(singing,'select_voice',return_value={'id':'test-self'});self.voice.start()
  self.transport=patch.object(singing,'onebot',return_value={'message_id':'failure-notice'});self.api=self.transport.start()
  self.src=self.root/'source.wav'
  with wave.open(str(self.src),'wb') as w:w.setparams((1,2,24000,0,'NONE','not compressed'));w.writeframes(b'\0\0'*24000*6)
  singing.import_song('测试歌',str(self.src),'vocals')
  singing.atomic_json(singing.ROOT/'ready.json',{'pipeline_verified':True,'version':singing.VERSION})
 def tearDown(self):self.transport.stop();self.voice.stop();self.patch.stop();self.tmp.cleanup()
 def status(self,id):
  with singing.db() as db:return dict(db.execute('select * from jobs where id=?',(id,)).fetchone())
 def test_test_only_and_unverified_never_send(self):
  singing.import_song('内部测试',str(self.src),'vocals',test_only=True)
  with self.assertRaises(ValueError):singing.enqueue('内部测试','123456')
  (singing.ROOT/'ready.json').unlink()
  with self.assertRaises(RuntimeError):singing.enqueue('测试歌','123456')
 def test_limits_and_missing_source(self):
  for kwargs in ({'seconds':31},{'seconds':4},{'start':-1}):
   with self.assertRaises(ValueError):singing.enqueue('测试歌',**kwargs)
  with self.assertRaises(ValueError):singing.enqueue('不存在')
  with self.assertRaises(ValueError):singing.local_audio('https://example.com/a.mp3')
 def test_duplicate_and_target_isolation(self):
  a,_=singing.enqueue('测试歌','private:123456');b,dup=singing.enqueue('测试歌','private:123456');c,_=singing.enqueue('测试歌','group:123456')
  self.assertEqual(a,b);self.assertTrue(dup);self.assertNotEqual(a,c)
  with self.assertRaises(RuntimeError):singing.enqueue('测试歌','private:789012')
 def test_dedup_uses_delivery_time_for_slow_generation(self):
  id,_=singing.enqueue('测试歌','123456')
  with singing.db() as db:
   db.execute('update jobs set created=? where id=?',(time.time()-900,id));singing.update(db,id,'sent',message_id='receipt')
  self.assertEqual(singing.enqueue('测试歌','123456'),(id,True))
 def test_preview_never_sends(self):
  id,_=singing.enqueue('测试歌')
  with patch.object(singing,'render',return_value=self.src),patch.object(singing,'send') as send:singing.worker();send.assert_not_called()
  self.assertEqual(self.status(id)['status'],'ready')
 def test_ready_preview_reuses_job_without_consuming_quota(self):
  id,_=singing.enqueue('测试歌')
  with singing.db() as db:singing.update(db,id,'ready',audio=str(self.src))
  self.assertEqual(singing.enqueue('测试歌'),(id,True))
 def test_failure_does_not_send_original(self):
  id,_=singing.enqueue('测试歌','123456')
  with patch.object(singing,'render',side_effect=RuntimeError('conversion failed')),patch.object(singing,'send') as send:singing.worker();send.assert_not_called()
  self.assertEqual(self.status(id)['status'],'failed');self.api.assert_called_once()
 def test_preflight_is_not_unknown(self):
  id,_=singing.enqueue('测试歌','123456')
  with patch.object(singing,'render',return_value=self.src),patch.object(singing,'send',side_effect=RuntimeError('before dispatch')):singing.worker()
  self.assertEqual(self.status(id)['status'],'failed')
 def test_receipt(self):
  id,_=singing.enqueue('测试歌','123456')
  def send(*a,**kw):kw['on_dispatch']();return 'receipt'
  with patch.object(singing,'render',return_value=self.src),patch.object(singing,'send',side_effect=send):singing.worker()
  self.assertEqual(self.status(id)['status'],'sent');self.assertEqual(self.status(id)['message_id'],'receipt')
 def test_ambiguous_never_replayed(self):
  id,_=singing.enqueue('测试歌','123456')
  def send(*a,**kw):kw['on_dispatch']();raise TimeoutError('ambiguous')
  with patch.object(singing,'render',return_value=self.src),patch.object(singing,'send',side_effect=send) as sent:singing.worker();singing.worker();self.assertEqual(sent.call_count,1)
  self.assertEqual(self.status(id)['status'],'unknown');self.api.assert_not_called()
  self.assertEqual(singing.enqueue('测试歌','123456'),(id,True))
 def test_expiry_after_render(self):
  id,_=singing.enqueue('测试歌','123456');now=time.time()
  with patch.object(singing,'render',return_value=self.src),patch.object(singing,'send') as send,patch.object(singing.time,'time',side_effect=[now,now,now+3700,now+3700,now+3700]):
   singing.worker();send.assert_not_called()
  self.assertEqual(self.status(id)['status'],'expired')
 def test_cache_verifies_hash(self):
  id,_=singing.enqueue('测试歌');row=self.status(id);out=singing.ROOT/'cache'/row['cache_key'];out.mkdir(parents=True)
  audio=out/'song.wav';audio.write_bytes(self.src.read_bytes());singing.atomic_json(out/'result.json',{'sha256':singing.digest(audio),'voice_id':'test-self'})
  with patch.object(singing,'run',side_effect=AssertionError('cached')):
   self.assertEqual(singing.render(json.loads(row['spec']),row['cache_key'],self.root/'log'),audio)
 def test_tampered_source_rejected(self):
  source=Path(singing.library()['测试歌']['source']);source.write_bytes(source.read_bytes()+b'x')
  with self.assertRaises(ValueError):singing.enqueue('测试歌')
 def test_worker_crash_sending_remains_unknown(self):
  id,_=singing.enqueue('测试歌','123456')
  with singing.db() as db:singing.update(db,id,'sending')
  with patch.object(singing,'send') as send:singing.worker();send.assert_not_called()
  self.assertEqual(self.status(id)['status'],'unknown')
 def test_job_keeps_self_voice(self):
  id,_=singing.enqueue('测试歌');self.assertEqual(json.loads(self.status(id)['spec'])['voice_id'],'test-self')
if __name__=='__main__':unittest.main()
