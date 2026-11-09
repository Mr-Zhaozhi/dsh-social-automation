#!/usr/bin/env python3
"""Configure ordered video providers locally; credentials never enter argv or the repo."""
import getpass,json,sys
from pathlib import Path
from lib.runtime import atomic_json
sys.path.insert(0,str(Path(__file__).parent/'lib'))
from video_model_api import endpoint
p=Path.home()/'.dsh/secrets/huohuo-video-model.json'
try:old=json.loads(p.read_text());entries=old.get('providers',[old])
except (OSError,ValueError):entries=[]
print('小伴视频理解：Qwen 优先，失败后豆包。密钥只保存在本机，输入不回显。')
providers=[]
for provider,model,base in [('qwen','qwen3.5-omni-flash','https://dashscope.aliyuncs.com/compatible-mode/v1'),('doubao','doubao-seed-2-0-mini-260428','https://ark.cn-beijing.volces.com/api/v3')]:
 prior=next((v for v in entries if v.get('provider')==provider),{})
 print('\n'+provider+' / '+model)
 base=input('官方接口地址（回车保留现有地址或使用默认）：').strip() or prior.get('baseUrl',base)
 c={'provider':provider,'model':model,'baseUrl':base};endpoint(c)
 key=getpass.getpass('API Key（回车保留现有密钥；未配置时跳过）：').strip() or prior.get('apiKey','')
 if not key:continue
 if len(key)<10:raise SystemExit('密钥过短，未保存。')
 providers.append({**c,'apiKey':key})
if not providers:raise SystemExit('没有有效配置，未保存。')
p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);atomic_json(p,{'version':2,'providers':providers})
print('已保存；下次调用自动读取。新电脑需单独配置密钥。')
