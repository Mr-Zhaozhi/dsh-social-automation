#!/usr/bin/env python3
"""Find portable Huohuo images without a model or network request."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from material_library import search,summary,catalog,resolve_material

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--query',default='');p.add_argument('--category',default='')
    p.add_argument('--limit',type=int,default=8);p.add_argument('--summary',action='store_true')
    p.add_argument('--id');p.add_argument('--include-reference',action='store_true')
    a=p.parse_args()
    if a.summary:result=summary()
    elif a.id:
        row=next((r for r in catalog()['assets'] if r['id']==a.id),None)
        if not row:raise ValueError('未找到素材ID')
        result={**row,'absolute_path':resolve_material(row['file'],allow_gif=True)}
    else:result=search(a.query,a.category,a.limit,include_reference=a.include_reference)
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':
    try:main()
    except (ValueError,OSError) as e:print(str(e),file=sys.stderr);sys.exit(1)
