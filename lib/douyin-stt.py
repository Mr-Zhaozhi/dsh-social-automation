"""Native Douyin media adapter; same local ASR as QQ, no cloud credentials."""
import importlib.util,json,sys
from pathlib import Path
from stt import transcribe
model=Path(__file__).resolve().parents[1]/'.runtime/stt-model/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
if '--probe' in sys.argv:
 dependency=importlib.util.find_spec('sherpa_onnx') is not None
 cached=(model/'model.int8.onnx').is_file() and (model/'tokens.txt').is_file()
 print(json.dumps({'available':dependency and cached,'dependencyAvailable':dependency,'modelCached':cached}));sys.exit(0)
request=json.load(sys.stdin)
print(json.dumps({'text':transcribe(Path(request['path']),model),'segments':[],'task':'transcribe'},ensure_ascii=False))
