import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from doctor import browser_control_status

class BrowserDoctorTests(unittest.TestCase):
 def test_http_alone_is_not_control_ready(self):
  def trap():raise AssertionError('must preserve failed browser without probing')
  for state in [None,{}, {'ready':False,'launchFailure':{'code':'EDGE_FOCUS_RESET_FAILED'}}]:
   r=browser_control_status(True,state,trap)
   self.assertFalse(r['ok']);self.assertTrue(r['http_available']);self.assertFalse(r['control_ready'])
 def test_live_control_probe_required(self):
  self.assertFalse(browser_control_status(False,{'ready':True},lambda:True)['ok'])
  self.assertFalse(browser_control_status(True,{'ready':True},lambda:False)['ok'])
  self.assertTrue(browser_control_status(True,{'ready':True},lambda:True)['control_ready'])
