import sys,json,platform
from pathlib import Path
import torch
torch.set_num_threads(2)
torch.set_num_interop_threads(2)
import onnxruntime as ort
SessionOptions=ort.SessionOptions
def bounded_options():
    options=SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
    return options
ort.SessionOptions=bounded_options
from audio_separator.separator import Separator
source,out,models=sys.argv[1:]
separator=Separator(output_dir=out,output_format='WAV',model_file_dir=models,normalization_threshold=0.9)
if platform.system()=='Darwin' and platform.machine()=='x86_64':
    separator.torch_device=torch.device('cpu');separator.torch_device_mps=None
    separator.onnx_execution_provider=['CPUExecutionProvider']
    print('Intel Mac: explicitly using CPU, two inference threads',flush=True)
separator.load_model(model_filename='UVR-MDX-NET-Inst_HQ_3.onnx')
files=separator.separate(source)
paths=[Path(out)/f for f in files]
vocals=[p for p in paths if '_(Vocals)_' in p.stem]
instrumental=[p for p in paths if '_(Instrumental)_' in p.stem]
if len(vocals)!=1 or len(instrumental)!=1:raise RuntimeError('Unexpected separator outputs')
(Path(out)/'stems.json').write_text(json.dumps({'vocals':str(vocals[0]),'instrumental':str(instrumental[0])}))
