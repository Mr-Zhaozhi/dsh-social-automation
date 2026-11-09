import importlib.util,os,tempfile,time,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('maintenance',Path(__file__).resolve().parents[1]/'lib/maintenance.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RetentionTests(unittest.TestCase):
 def test_retention_preserves_state_open_files_and_symlinks(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);state=root/'.state';state.mkdir();now=time.time()
   def put(name,days):
    p=state/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('test');os.utime(p,(now-days*86400,now-days*86400));return p
   old=put('old.log',8);cache=put('video-audio/old.wav',4);fresh=put('video-audio/new.wav',2);memory=put('shared-context/recall.sqlite',100);job=put('singing/cache/song.wav',100);active=put('active.log',10);archive=put('obsolete-deploy-build-v2.zip',8)
   outside=root/'outside';outside.write_text('keep');(state/'video-audio/link.wav').symlink_to(outside)
   r=m.clean(root,False,{str(active)},now);self.assertEqual(r['files'],3);self.assertTrue(old.exists())
   r=m.clean(root,True,{str(active)},now);self.assertEqual(r['files'],3)
   for p in (old,cache,archive):self.assertFalse(p.exists())
   for p in (fresh,memory,job,active,outside):self.assertTrue(p.exists())
 def test_symlink_directory_is_not_traversed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'.state').mkdir();outside=root/'outside';outside.mkdir();p=outside/'old.log';p.write_text('safe');os.utime(p,(0,0));(root/'.state/preview').symlink_to(outside,target_is_directory=True)
   self.assertEqual(m.clean(root,True,set())['files'],0);self.assertTrue(p.exists())
 def test_budget_and_pending_cache_are_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p=root/'.state/video-understanding';p.mkdir(parents=True)
   for name,body in [('budget.json','{}'),('pending.json','{"status":"pending"}'),('done.json','{"status":"complete"}')]:
    f=p/name;f.write_text(body);os.utime(f,(0,0))
   self.assertEqual(m.clean(root,True,set())['files'],1)
   self.assertTrue((p/'budget.json').exists());self.assertTrue((p/'pending.json').exists())
