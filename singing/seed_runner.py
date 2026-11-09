"""Pinned Seed-VC adapter. CPU uses float32; no global Torch monkeypatch."""
import os,sys,json,hashlib,platform,contextlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
repo=root/'.runtime/seed-vc-src'
try:selection=json.loads((root/'.state/singing/device.json').read_text())
except (OSError,ValueError):selection={}
if selection.get('verified') is True and selection.get('device') in ('cpu','mps'):os.environ.setdefault('HUOHUO_SINGING_DEVICE',selection['device'])
for flag in ('--source','--target','--output','--checkpoint','--config'):
    if flag in sys.argv:
        i=sys.argv.index(flag)+1;sys.argv[i]=str(Path(sys.argv[i]).resolve())
os.chdir(repo);sys.path.insert(0,str(repo))
models=root/'.runtime/singing-models'
manifest=models/'seed-svc.ready.json'
if manifest.exists():
    expected=json.loads(manifest.read_text())
    verification=models/'verified-stat.json'
    try:previous=json.loads(verification.read_text())
    except (OSError,ValueError):previous={}
    checked={}
    for name,value in expected.items():
        stat=(models/name).stat();signature={'size':stat.st_size,'mtime_ns':stat.st_mtime_ns,'sha256':value}
        if previous.get(name)!=signature and hashlib.sha256((models/name).read_bytes()).hexdigest()!=value:raise RuntimeError('Singing model integrity check failed')
        checked[name]=signature
    temporary=verification.with_suffix('.tmp');temporary.write_text(json.dumps(checked));os.replace(temporary,verification)
    sys.argv.extend(['--checkpoint',str(models/'seed-svc.pth'),'--config',str(models/'seed-svc.yml')])
os.environ.setdefault('OMP_NUM_THREADS','2')
os.environ.setdefault('MKL_NUM_THREADS','2')
os.environ.setdefault('HF_HUB_DISABLE_XET','1')
import torch
torch.set_num_threads(2)
torch.set_num_interop_threads(2)
source=(repo/'inference.py').read_text()
old='torch_dtype=torch.float16).to(device)'
if source.count(old)!=1:raise RuntimeError('Seed-VC source version changed; review CPU adapter')
if os.environ.get('HUOHUO_SINGING_DEVICE')=='cpu' or (platform.system()=='Darwin' and platform.machine()=='x86_64' and os.environ.get('HUOHUO_SINGING_DEVICE')!='mps'):
    source=source.replace('fp16 = False',"device = torch.device('cpu')\nprint('Seed-VC device: CPU (Intel Mac)', flush=True)\nfp16 = False",1)
source=source.replace(old,'torch_dtype=(torch.float32 if device.type == "cpu" else torch.float16)).to(device)')
source=source.replace('ori_inputs = whisper_feature_extractor([waves_16k.squeeze(0).cpu().numpy()],', 'ori_inputs = whisper_feature_extractor([waves_16k.squeeze(0).cpu().numpy()], sampling_rate=16000,')
source=source.replace('with torch.autocast(device_type=device.type, dtype=torch.float16 if fp16 else torch.float32):', "with (torch.autocast(device_type='cuda', dtype=torch.float16) if device.type == 'cuda' and fp16 else __import__('contextlib').nullcontext()):")
source=source.replace('kaldi.fbank(ori_waves_16k,', 'kaldi.fbank(ori_waves_16k.cpu(),')
source=source.replace('campplus_model(feat2.unsqueeze(0))', 'campplus_model(feat2.unsqueeze(0).to(device))')
source=source.replace('RMVPE(model_path, is_half=False, device=device)', "RMVPE(model_path, is_half=False, device=('cpu' if device.type == 'mps' else device))")
source=source.replace('f0_fn = f0_extractor.infer_from_audio', "f0_fn = lambda audio, **kwargs: f0_extractor.infer_from_audio(audio.cpu() if device.type == 'mps' else audio, **kwargs)")
source=source.replace('torch.from_numpy(F0_ori).to(device)', 'torch.from_numpy(F0_ori).float().to(device)').replace('torch.from_numpy(F0_alt).to(device)', 'torch.from_numpy(F0_alt).float().to(device)')
exec(compile(source,str(repo/'inference.py'),'exec'),{'__name__':'__main__','__file__':str(repo/'inference.py')})
