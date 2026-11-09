import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from news import plain,valid
class NewsTests(unittest.TestCase):
 def test_clean(self):self.assertEqual(plain('<p>甲</p><script>secret()</script><p>乙 &amp; 丙</p>'),'甲\n乙 & 丙')
 def test_urls(self):
  self.assertTrue(valid('https://www.ithome.com/1/2.htm','www.ithome.com'))
  for u in ['http://www.ithome.com/a','https://evil.example/a','https://user@www.ithome.com/a']:
   self.assertFalse(valid(u,'www.ithome.com'))
if __name__=='__main__':unittest.main()
