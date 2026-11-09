import unittest,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'lib'))
from video_shots import shot_plan,shot_filter
class ShotsTest(unittest.TestCase):
 def test_plan_rejects_missing_purpose_and_wrong_count(self):
  for plan in [[{'layout':'wide','purpose':'随便'}],[{'layout':'oops','purpose':'让观众看清照片里的星空'}],[]]:
   with self.assertRaises(ValueError):shot_plan({'shot_plan':plan},1)
 def test_cards_preserve_composition_and_media_use_source_background(self):
  self.assertNotIn('crop=',shot_filter('card',0,4))
  self.assertIn('split=2',shot_filter('wide',0,4))
  self.assertNotEqual(shot_filter('wide',0,4),shot_filter('portrait',0,4))
