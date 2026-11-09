#!/usr/bin/env python3
"""Local SenseVoice adapter for the OneBot custom STT contract."""
import argparse, json, os, time, wave
from pathlib import Path

def transcribe(source, model_dir):
    import numpy as np
    import sherpa_onnx
    with wave.open(str(source), 'rb') as audio:
        if audio.getnchannels()!=1 or audio.getsampwidth()!=2 or audio.getframerate()!=16000:
            raise ValueError('STT requires mono 16 kHz PCM16 WAV')
        if audio.getnframes()>16000*300:
            raise ValueError('Voice exceeds five minutes')
        samples=np.frombuffer(audio.readframes(audio.getnframes()),dtype=np.int16).astype(np.float32)/32768
    if not len(samples) or np.max(np.abs(samples))<0.0001:return ''
    recognizer=sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(model_dir/'model.int8.onnx'),tokens=str(model_dir/'tokens.txt'),
        num_threads=2,language='auto',use_itn=True,provider='cpu')
    stream=recognizer.create_stream();stream.accept_waveform(16000,samples)
    recognizer.decode_stream(stream)
    return stream.result.text.strip()

def main():
    p=argparse.ArgumentParser();p.add_argument('--file',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    root=Path(__file__).resolve().parents[1]
    model=root/'.runtime/stt-model/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
    started=time.monotonic();text=transcribe(Path(a.file),model)
    target=Path(a.out+'.txt');target.write_text(text);target.chmod(0o600)
    # Keep health metadata, never the private transcript.
    state=root/'.state/stt-health.json';state.parent.mkdir(exist_ok=True)
    tmp=state.with_suffix('.'+str(os.getpid())+'.tmp');tmp.write_text(json.dumps({'ok':True,'at':time.time(),'seconds':round(time.monotonic()-started,2),'characters':len(text)}));tmp.chmod(0o600);tmp.replace(state)
if __name__=='__main__':main()
