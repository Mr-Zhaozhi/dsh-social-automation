#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'lib'))
from creative_media import import_url,create,status
p=argparse.ArgumentParser();s=p.add_subparsers(dest='action',required=True)
a=s.add_parser('import');a.add_argument('--url',required=True);a.add_argument('--source-page',required=True);a.add_argument('--license',required=True);a.add_argument('--credit',default='')
a=s.add_parser('create');a.add_argument('--spec',required=True,type=Path)
a=s.add_parser('status');a.add_argument('id')
a=p.parse_args()
try:
 if a.action=='import':r={'file':str(import_url(a.url,a.source_page,a.license,a.credit))}
 elif a.action=='create':r=create(json.loads(a.spec.read_text()))
 else:r=status(a.id)
 print(json.dumps(r,ensure_ascii=False,indent=2))
except Exception as e:print('素材操作失败：'+str(e),file=sys.stderr);sys.exit(1)
