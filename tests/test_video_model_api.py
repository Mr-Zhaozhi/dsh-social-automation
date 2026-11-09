import unittest,tempfile,subprocess,sys,json,base64,io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import video_model_api as api
from runtime import ffmpeg
class VideoModelTransport(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();cls.root=Path(cls.tmp.name);src=cls.root/'fixture.webm'
  subprocess.run([ffmpeg(),'-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x120:rate=5','-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-t','2.5','-c:a','libopus','-c:v','libvpx','-b:v','100k','-y',str(src)],check=True)
  cls.payload={'clip':{'mimeType':'video/webm','data':base64.b64encode(src.read_bytes()).decode(),'durationSeconds':2.5,'fps':4},'transcript':'这是实际音轨转写，不要把图片当成声音。','title':'test'}
 @classmethod
 def tearDownClass(cls):cls.tmp.cleanup()
 def test_qwen_wire_format_uses_mp4_local_transcript_and_bounded_non_thinking(self):
  config=self.root/'secrets.json';config.write_text(json.dumps({'provider':'qwen','model':'qwen3.5-omni-flash','apiKey':'fixture-secret','baseUrl':'https://dashscope.aliyuncs.com/compatible-mode/v1'}))
  captured={}
  class Response:
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def __iter__(self):
    values=[{'choices':[{'delta':{'content':json.dumps({'summary':'test','events':[],'uncertain':[]})},'finish_reason':'stop'}]}, {'choices':[],'usage':{'prompt_tokens':123,'completion_tokens':12}}]
    return iter([('data: '+json.dumps(v)+'\n\n').encode() for v in values]+[b'data: [DONE]\n'])

  class Client:
   def open(self,req,timeout):captured.update(url=req.full_url,body=json.loads(req.data),timeout=timeout);return Response()
  with patch.object(api,'CONFIG',config),patch.object(sys,'stdin',io.StringIO(json.dumps(self.payload))),patch.object(api.urllib.request,'build_opener',return_value=Client()),patch.object(api,'curl_proxy_args',return_value=[]):r=api.run()
  self.assertTrue(r['ok']);self.assertEqual(r['usage']['inputTokens'],123);b=captured['body'];self.assertEqual(b['model'],'qwen3.5-omni-flash');self.assertTrue(b['stream']);self.assertEqual(b['modalities'],['text']);self.assertEqual(b['max_tokens'],1600)
  parts=b['messages'][1]['content'];self.assertEqual(parts[0]['fps'],4);self.assertTrue(parts[0]['video_url']['url'].startswith('data:video/mp4;base64,'));raw=base64.b64decode(parts[0]['video_url']['url'].split(',')[1]);self.assertIn(b'ftyp',raw[:32]);self.assertIn(b'mp4a',raw); self.assertLess(len(parts[0]['video_url']['url']),10_000_000);self.assertEqual(json.loads(parts[1]['text'])['localTranscript'],self.payload['transcript']);self.assertEqual(captured['url'],'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
 def test_invalid_endpoint_cannot_receive_key_or_media(self):
  config=self.root/'bad.json';config.write_text(json.dumps({'provider':'qwen','model':'qwen3.5-omni-flash','apiKey':'fixture-secret','baseUrl':'https://evil.example/compatible-mode/v1'}))
  with patch.object(api,'CONFIG',config),patch.object(sys,'stdin',io.StringIO(json.dumps(self.payload))),patch.object(api.urllib.request,'build_opener') as network:
   with self.assertRaises(ValueError):api.run()
   network.assert_not_called()

 def test_sse_truncation_error_and_prose_are_rejected(self):
  for raw in [b'data: {"choices":[{"delta":{"content":"{}"}}]}\n',b'data: {"error":{"code":"failed"}}\n',b'data: {"choices":[{"delta":{"content":"Here is {}"},"finish_reason":"stop"}]}\n']:
   with self.assertRaises(ValueError):api.parse_response(io.BytesIO(raw),True)
 def test_provider_hosts_are_not_interchangeable(self):
  with self.assertRaises(ValueError):api.endpoint({'provider':'doubao','baseUrl':'https://dashscope.aliyuncs.com/api/v3'})
  with self.assertRaises(ValueError):api.endpoint({'provider':'qwen','baseUrl':'https://ark.cn-beijing.volces.com/compatible-mode/v1'})
  self.assertEqual(api.endpoint({'provider':'doubao','baseUrl':'https://ark.cn-beijing.volces.com/api/v3'}),'https://ark.cn-beijing.volces.com/api/v3/chat/completions')
 def test_doubao_selection_and_video_fps_are_provider_specific(self):
  config=self.root/'dual.json';config.write_text(json.dumps({'providers':[{'provider':'qwen','model':'qwen3.5-omni-flash','apiKey':'qwen-only','baseUrl':'https://dashscope.aliyuncs.com/compatible-mode/v1'},{'provider':'doubao','model':'doubao-seed-2-0-mini-260428','apiKey':'doubao-only','baseUrl':'https://ark.cn-beijing.volces.com/api/v3'}]}))
  captured={}
  class Response:
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def read(self,n):return json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'summary':'test','events':[],'uncertain':[]})}}]}).encode()
  class Client:
   def open(self,req,timeout):captured.update(url=req.full_url,body=json.loads(req.data),authorization=req.get_header('Authorization'));return Response()
  with patch.object(api,'CONFIG',config),patch.object(sys,'stdin',io.StringIO(json.dumps({**self.payload,'provider':'doubao'}))),patch.object(api.urllib.request,'build_opener',return_value=Client()),patch.object(api,'curl_proxy_args',return_value=[]):r=api.run()
  self.assertEqual(captured['authorization'],'Bearer doubao-only');self.assertEqual(r['provider'],'doubao');b=captured['body'];self.assertFalse(b['stream']);self.assertEqual(b['thinking'],{'type':'disabled'});self.assertEqual(b['messages'][1]['content'][0]['video_url']['fps'],4);self.assertNotIn('fps',b['messages'][1]['content'][0])
 def test_standalone_transport_starts_with_utf8_prompt(self):
  # Import/py_compile alone missed macOS Python's direct-script UTF-8 tokenizer failure.
  r=subprocess.run([sys.executable,str(Path(api.__file__).resolve())],input='{}',text=True,capture_output=True,timeout=10)
  self.assertEqual(r.returncode,0,r.stderr);self.assertFalse(json.loads(r.stdout)['ok']);self.assertNotIn('SyntaxError',r.stderr)
