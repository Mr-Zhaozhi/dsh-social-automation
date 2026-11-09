"""Install versioned owned stickers on either Mac without importing private state."""
import hashlib,json,os,shutil,sqlite3,tempfile,time
from pathlib import Path
from runtime import WORKSPACE,USER_HOME,atomic_json

def install_pack(source,home):
    source=Path(source)
    if not (source/'catalog.json').exists():return '本版本没有附带第三弹图库，跳过'
    catalog=json.loads((source/'catalog.json').read_text());pack_id=catalog['id']
    if pack_id!=source.name or not pack_id.startswith('huohuo-') or not all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in pack_id):raise ValueError('图库编号不符')
    files=[]
    for row in catalog['images']:
        p=(source/row['file']).resolve()
        if not p.is_relative_to(source.resolve()) or p.suffix not in ('.png','.gif') or not row['tag'].isascii() or not row['tag'].isalpha():raise ValueError('图库路径或分类不符')
        data=p.read_bytes()
        if not 32<len(data)<=8*1024*1024 or hashlib.sha256(data).hexdigest()!=row['sha256']:raise ValueError('图库文件校验失败：'+p.name)
        if not (data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith((b'GIF87a',b'GIF89a'))):raise ValueError('不是PNG/GIF')
        files.append((row,p,data))
    folder=Path(home)/'.dsh/meme-packs'/pack_id;was_installed=(folder/'index.db').exists();folder.mkdir(parents=True,exist_ok=True)
    for row,p,data in files:
        dest=folder/'memes'/row['tag']/p.name;dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists() or hashlib.sha256(dest.read_bytes()).hexdigest()!=row['sha256']:
            with tempfile.NamedTemporaryFile(dir=dest.parent,delete=False) as f:f.write(data);tmp=Path(f.name)
            os.replace(tmp,dest)
    with sqlite3.connect(folder/'index.db',timeout=10) as db:
        db.execute("CREATE TABLE IF NOT EXISTS memes (path TEXT PRIMARY KEY, tag TEXT NOT NULL, file_name TEXT NOT NULL, file_hash TEXT, caption TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '', mtime REAL, captioned_at REAL)")
        for row,p,data in files:
            db.execute('INSERT OR REPLACE INTO memes VALUES (?,?,?,?,?,?,?,?)',('memes/'+row['tag']+'/'+p.name,row['tag'],p.name,hashlib.md5(data).hexdigest(),row['caption'],row['keywords'],p.stat().st_mtime,time.time()))
    atomic_json(folder/'manifest.json',{k:catalog[k] for k in ('id','name','version','description')})
    settings=Path(home)/'.dsh/dsh-expression.json'
    data=json.loads(settings.read_text()) if settings.exists() else {}
    # Add on first install only; subsequent code updates respect a manual disable.
    if not was_installed:
        data['enabledPacks']=list(dict.fromkeys([*data.get('enabledPacks',['huohuo-self','deepseek-chan','dsh-meme-user']),pack_id]))
        atomic_json(settings,data)
    return f"{catalog['name']}：{len(files)} 张已安装"

def install(root=WORKSPACE,home=USER_HOME):
    catalogs=sorted((Path(root)/'assets/stickers').glob('*/catalog.json'))
    return '；'.join(install_pack(p.parent,home) for p in catalogs) or '本版本未附带表情图库'

if __name__=='__main__':print(install())
