#!/usr/bin/env python3
"""Verify the unmodified shared source archive after extraction."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 manifest=json.loads((ROOT/'MANIFEST.json').read_text());errors=[]
 for name,expected in manifest['files'].items():
  path=(ROOT/name).resolve()
  if not path.is_relative_to(ROOT) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:errors.append(name)
 if errors:raise SystemExit('文件缺失或已改动：'+', '.join(errors))
 print('源码校验通过：'+str(len(manifest['files']))+' 个文件。配置或改代码后校验值变化属正常情况。')
if __name__=='__main__':main()
