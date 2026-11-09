import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from chat_delivery import quiet_patch

class QuietDeliveryTests(unittest.TestCase):
 def test_settings_preserved_and_idempotent(self):
  before='- id: dsh-onebot\n  config:\n    accessToken: unchanged\n    interimMessages: true\n    notices:\n      queue: true\n      deferredTimeout: true\n    newMessagePolicy: queue\n- id: browser\n  config:\n    untouched: true\n'
  after=quiet_patch(before)
  self.assertEqual(after,quiet_patch(after))
  for value in ['accessToken: unchanged','deferredTimeout: true','newMessagePolicy: queue','interimMessages: false','queue: false','steerAccepted: false','answerAccepted: false','- id: browser\n  config:\n    untouched: true\n']:self.assertIn(value,after)
 def test_missing_entry_refused(self):
  with self.assertRaises(ValueError):quiet_patch('- id: browser\n')
