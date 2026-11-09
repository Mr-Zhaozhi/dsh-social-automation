import sys,tempfile,unittest,sqlite3,time,subprocess
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import voice
class VoiceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.state=patch.object(voice,'STATE',Path(self.tmp.name));self.state.start()
  cfg=voice.config();cfg['voice']={**cfg['voice'],'id':'test-self','primary_profile':'self','video_profiles':{'douyin':'self'},'mood_weights':{m:{'self':50,'jinx':50} for m in ('normal','happy','playful','gentle','comfort','sad')},'profiles':{name:{'id':'test-'+name,'instructions':name} for name in ('self','jinx','lively','cantonese','beijing','zed')}};self.cfg=patch.object(voice,'config',return_value=cfg);self.cfg.start()
 def tearDown(self):self.cfg.stop();self.state.stop();self.tmp.cleanup()
 def test_duplicate_same_target_only(self):
  a,_=voice.enqueue('测试','123456');b,dup=voice.enqueue('测试','123456');c,_=voice.enqueue('测试','group:123456')
  self.assertEqual(a,b);self.assertTrue(dup);self.assertNotEqual(a,c)
 def test_no_group_fallback(self):
  p=Path(self.tmp.name)/'a.wav';p.write_bytes(b'test')
  with patch.object(voice,'onebot',side_effect=RuntimeError('failure')) as api:
   with self.assertRaises(RuntimeError):voice.send('private:123456',p)
  self.assertEqual(api.call_count,1);self.assertEqual(api.call_args.args[0],'send_private_msg')
 def test_failed_generation_does_not_send(self):
  job,_=voice.enqueue('测试','123456')
  with patch.object(voice,'synthesize',side_effect=RuntimeError('HTTP 429')),patch.object(voice,'send') as send:voice.worker();send.assert_not_called()
  with voice.database() as db:self.assertEqual(db.execute('select status from jobs where id=?',(job,)).fetchone()[0],'failed')
 def test_ambiguous_send_never_retried(self):
  job,_=voice.enqueue('测试','123456')
  def timeout(*args,**kwargs):
   kwargs['on_dispatch']();raise TimeoutError()
  with patch.object(voice,'synthesize',return_value=Path('audio')),patch.object(voice,'send',side_effect=timeout) as send:voice.worker();voice.worker();self.assertEqual(send.call_count,1)
  with voice.database() as db:self.assertEqual(db.execute('select status from jobs where id=?',(job,)).fetchone()[0],'unknown')
 def test_preflight_failure_is_failed_not_unknown(self):
  from runtime import BeforeDeliveryError
  job,_=voice.enqueue('测试','123456')
  with patch.object(voice,'synthesize',return_value=Path('audio')),patch.object(voice,'send',side_effect=BeforeDeliveryError('检查失败，尚未发送')):
   voice.worker()
  with voice.database() as db:
   row=db.execute('select status,error from jobs where id=?',(job,)).fetchone()
   self.assertEqual(row['status'],'failed');self.assertIn('尚未发送',row['error'])
 def test_actual_dispatch_boundary(self):
  job,_=voice.enqueue('测试','123456');p=Path(self.tmp.name)/'a.wav';p.write_bytes(b'audio')
  def api(action,payload,**kwargs):
   with voice.database() as db:self.assertEqual(db.execute('select status from jobs where id=?',(job,)).fetchone()[0],'synthesizing')
   kwargs['on_dispatch']()
   with voice.database() as db:self.assertEqual(db.execute('select status from jobs where id=?',(job,)).fetchone()[0],'sending')
   return {'message_id':'receipt'}
  with patch.object(voice,'synthesize',return_value=p),patch.object(voice,'onebot',side_effect=api):voice.worker()
  with voice.database() as db:self.assertEqual(db.execute('select status from jobs where id=?',(job,)).fetchone()[0],'sent')
 def test_expired_not_sent(self):
  job,_=voice.enqueue('测试','123456')
  with voice.database() as db:db.execute('update jobs set created=?',(time.time()-500,))
  with patch.object(voice,'synthesize') as synth:voice.worker();synth.assert_not_called()
 def test_lock_blocks_other_worker(self):
  with voice.worker_lock() as acquired:
   self.assertTrue(acquired)
   with voice.worker_lock() as second:self.assertFalse(second)
 def test_background_environment_removed(self):
  voice.database().close()
  with patch.dict(voice.os.environ,{'BG':'1'}),patch.object(voice.subprocess,'Popen') as proc:
   voice.kick_worker();self.assertNotIn('BG',proc.call_args.kwargs['env']);self.assertIn('--worker',proc.call_args.args[0])
 def test_invalid_target(self):
  for v in ['group:','0','group:123;sh','g123456']:
   with self.assertRaises(ValueError):voice.target_of(v)
 def test_weighted_mood_selection_and_retired_voice_rejected(self):
  with patch.object(voice.random,'random',return_value=.5):
   for mood in ('normal','happy','playful','gentle','comfort','sad'):
    self.assertEqual(voice.select_voice(mood=mood)['id'],'test-jinx')
   self.assertIn('温柔',voice.select_voice('晚安，抱抱你')['instructions'])
  for point,name in ((0,'self'),(.499,'self'),(.5,'jinx'),(.999,'jinx')):
   with patch.object(voice.random,'random',return_value=point):
    for mood in ('normal','happy','playful','gentle','comfort','sad'):
     self.assertEqual(voice.select_voice(mood=mood)['id'],'test-'+name)
  with self.assertRaises(ValueError):voice.select_voice(voice_id='test-retired')
  with self.assertRaises(ValueError):voice.select_voice(mood='arbitrary')
 def test_explicit_voice_wins_over_mood_without_randomness(self):
  with patch.object(voice.random,'random',side_effect=AssertionError('must not reroll')):
   for name in ('self','jinx','lively','cantonese','beijing','zed'):
    self.assertEqual(voice.select_voice(mood='gentle',voice_name=name)['id'],'test-'+name)
   self.assertEqual(voice.select_voice(voice_name='粤语女声')['id'],'test-cantonese')
   self.assertEqual(voice.select_voice(voice_name='劫')['id'],'test-zed')
   self.assertEqual(voice.select_voice(voice_name='英雄联盟劫')['id'],'test-zed')
   self.assertEqual(voice.select_voice(voice_id='test-beijing')['id'],'test-beijing')
  with self.assertRaises(ValueError):voice.select_voice(voice_name='missing')
  with self.assertRaises(ValueError):voice.select_voice(voice_name='jinx',voice_id='test-lively')
 def test_video_requires_self_on_douyin_and_respects_other_platforms(self):
  with patch.object(voice.random,'random',side_effect=AssertionError('must not reroll')):
   for spec in ({},{'platform':'douyin','voice':'beijing','mood':'playful'}):
    self.assertEqual(voice.select_video_voice(spec)['id'],'test-self')
   for platform in ('qq','wechat','xiaohongshu','zhihu'):
    self.assertEqual(voice.select_video_voice({'platform':platform,'voice':'beijing'})['id'],'test-beijing')
   for alias in ('本声','真实声音','小伴本声','自己的声音'):
    self.assertEqual(voice.select_voice(voice_name=alias)['profile'],'self')
  with self.assertRaises(ValueError):voice.select_video_voice({'platform':'unknown'})
  voice.config()['voice']['video_profiles']['douyin']='jinx'
  with self.assertRaises(ValueError):voice.select_video_voice({})
 def test_wechat_passes_exact_requested_voice(self):
  import importlib.util
  spec=importlib.util.spec_from_file_location('wechat_voice',Path(__file__).resolve().parents[1]/'wechat-voice.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with patch.object(module,'synthesize',return_value=Path('audio')) as synth:
   result=module.generate('你好',voice_name='beijing')
   self.assertEqual(result['voice_id'],'test-beijing');self.assertEqual(result['delivery'],'not-sent')
   synth.assert_called_once_with('你好',voice_id='test-beijing',mood='normal')
 def test_job_keeps_selection_on_worker_resume_and_duplicate_does_not_send_again(self):
  with patch.object(voice.random,'random',return_value=.5):job,_=voice.enqueue('晚安','123456',mood='gentle')
  same,duplicate=voice.enqueue('晚安','123456',mood='happy',voice_id='test-jinx')
  self.assertEqual(job,same);self.assertTrue(duplicate)
  with voice.database() as db:db.execute("update jobs set status='synthesizing' where id=?",(job,))
  with patch.object(voice.random,'random',side_effect=AssertionError('must not reroll')),patch.object(voice,'synthesize',return_value=Path('audio')) as synth,patch.object(voice,'send',return_value='receipt'):
   voice.worker();synth.assert_called_once_with('晚安',voice_id='test-jinx',mood='gentle')
  with voice.database() as db:self.assertEqual(db.execute('select voice_id from jobs where id=?',(job,)).fetchone()[0],'test-jinx')
 def test_existing_database_migrates_without_losing_history(self):
  with sqlite3.connect(str(voice.STATE/'voice.sqlite3')) as db:
   db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, fingerprint TEXT, created REAL, updated REAL, status TEXT, text TEXT, target TEXT, audio TEXT, error TEXT, message_id TEXT)')
   db.execute("INSERT INTO jobs VALUES ('old','fp',0,0,'sent','历史','private:123456',NULL,NULL,'receipt')")
  with voice.database() as db:
   row=db.execute("select * from jobs where id='old'").fetchone();self.assertEqual(row['status'],'sent');self.assertIsNone(row['voice_id'])
  with voice.database() as db:self.assertEqual(db.execute('select count(*) from jobs').fetchone()[0],1)
if __name__=='__main__':unittest.main()
