#!/usr/bin/env python3
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from video_editorial import context
print(json.dumps(context(),ensure_ascii=False,indent=2))
