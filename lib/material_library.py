"""Search checked-in character material locally; never treat art as activity evidence."""
import hashlib,json,re
from collections import Counter
from pathlib import Path
from runtime import WORKSPACE

def catalog(root=WORKSPACE):
    file=Path(root)/'assets/huohuo-life/catalog.json'
    if not file.exists():return {'categories':{},'assets':[]}
    return json.loads(file.read_text())

def resolve_material(value,root=WORKSPACE,allow_gif=False):
    root=Path(root).resolve();p=(root/value).resolve()
    if not p.is_relative_to(root):raise ValueError('素材不在当前工作区')
    row=next((r for r in catalog(root)['assets'] if r['file']==p.relative_to(root).as_posix()),None)
    if not row or not set(row['usage']) & {'illustration','video'}:raise ValueError('不是已登记可使用的角色素材')
    allowed=('.png','.jpg','.jpeg','.webp','.gif') if allow_gif else ('.png','.jpg','.jpeg','.webp')
    if p.suffix.lower() not in allowed or not p.is_file() or p.stat().st_size>12_000_000:raise ValueError('素材格式或大小不符')
    if hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:raise ValueError('素材校验失败，请重新拉取原图')
    return str(p)

def search(query='',category='',limit=8,root=WORKSPACE,include_reference=False):
    if not 1<=limit<=30:raise ValueError('limit需要1至30')
    data=catalog(root);q=query.strip().lower();terms=set(re.findall('[a-z0-9]+',q))
    for word in re.findall('[\u4e00-\u9fff]+',q):
        terms.add(word);terms.update(word[i:i+2] for i in range(len(word)-1))
    found=[]
    for row in data['assets']:
        if row['category']=='reference' and not include_reference:continue
        if category and not (row['category']==category or row['category'].startswith(category+'/')):continue
        text=(row['caption']+' '+' '.join(row['keywords'])+' '+data['categories'].get(row['category'],'')).lower()
        score=sum(3 for term in terms if term in text)+(10 if q and q in text else 0)
        if q and not score:continue
        found.append((score,row))
    found.sort(key=lambda r:(-r[0],r[1]['id']))
    return [{k:r[k] for k in ('id','file','category','caption','keywords','frames','usage')} for _,r in found[:limit]]

def summary(root=WORKSPACE):
    counts=Counter(r['category'] for r in catalog(root)['assets'] if r['category']!='reference')
    return {'categories':dict(counts),'search':'python3 materials.py --query "火锅" --limit 4',
            'instructions':'用关键词按需查素材，不必把整份图库塞进上下文。生活图为角色创作配图，不证明今天真实出门吃饭；拼图保持整张，头像不自动设置。images/assets可直接用搜索结果的相对路径。GIF用于支持动图的聊天或视频制作；QQ空间配图选静态图。'}
