import sys,json,time,unittest,subprocess
from pathlib import Path
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import runtime
class TransportTests(unittest.TestCase):
 def failure(self,code='GITHUB_NETWORK',retryable=True):
  return Mock(returncode=1,stderr=json.dumps(dict(code=code,message='检查失败',retryable=retryable)))
 def test_transient_guard_retries_before_dispatch(self):
  response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
  response.read.return_value=b'{"status":"ok","data":{"message_id":123}}'
  opener=Mock();opener.open.return_value=response;dispatch=Mock()
  with patch.object(runtime.subprocess,'run',side_effect=[self.failure(),Mock(returncode=0)]) as run,patch.object(runtime.time,'sleep'),patch.object(runtime,'onebot_token',return_value='fake'),patch.object(runtime.urllib.request,'build_opener',return_value=opener):
   self.assertEqual(runtime.onebot('send_private_msg',{},on_dispatch=dispatch)['message_id'],123)
   self.assertEqual(run.call_count,2);dispatch.assert_called_once();opener.open.assert_called_once()
 def test_standby_never_dispatches_or_retries(self):
  with patch.object(runtime.subprocess,'run',return_value=self.failure('FLEET_STANDBY',False)) as run,patch.object(runtime.urllib.request,'build_opener') as opener:
   with self.assertRaises(runtime.BeforeDeliveryError):runtime.onebot('send_private_msg')
   self.assertEqual(run.call_count,1);opener.assert_not_called()
 def test_retry_exhaustion_and_timeout_are_not_sent(self):
  for result in (self.failure(),subprocess.TimeoutExpired('guard',30)):
   options={'side_effect':result} if isinstance(result,Exception) else {'return_value':result}
   with patch.object(runtime.subprocess,'run',**options) as run,patch.object(runtime.time,'sleep'):
    with self.assertRaises(runtime.BeforeDeliveryError):runtime.check_runner()
    self.assertEqual(run.call_count,2)
 def test_expired_job_skips_guard(self):
  with patch.object(runtime.subprocess,'run') as run:
   with self.assertRaises(runtime.BeforeDeliveryError):runtime.check_runner(time.time()-1)
   run.assert_not_called()
if __name__=='__main__':unittest.main()
