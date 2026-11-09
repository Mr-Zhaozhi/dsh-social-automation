import unittest,importlib.util,pathlib
spec=importlib.util.spec_from_file_location('video',pathlib.Path(__file__).resolve().parents[1]/'make-video.py');video=importlib.util.module_from_spec(spec);spec.loader.exec_module(video)
class VideoStoryTests(unittest.TestCase):
 def test_caption_split_preserves_every_character_without_long_lines(self):
  text='今天我们要把很长很长的待办事项拆成一个个小动作，然后开始行动。'
  parts=video.caption_parts(text)
  self.assertEqual(''.join(parts),text);self.assertTrue(all(0<len(p)<=12 for p in parts))
 def test_incomplete_beats_rejected(self):
  with self.assertRaises(ValueError):video.validate_story({'title':'测试','text':'测试'*40,'assets':['a.png','b.gif','c.png'],'beats':['开头','发展','结尾']})
