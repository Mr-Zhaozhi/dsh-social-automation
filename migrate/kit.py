#!/usr/bin/env python3
"""Mac migration: verified files, path relocation, backups, dormant imported schedules."""
import argparse, datetime, hashlib, json, os, platform, shutil, sqlite3, subprocess, sys, tarfile, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from runtime import WORKSPACE, USER_HOME, HARNESS, atomic_json
TEXT={'.py','.sh','.mjs','.js','.json','.jsonl','.yml','.yaml','.md','.txt','.plist','.command'}
EXCLUDE={'node_modules','.git','__pycache__','.DS_Store','.state','.runtime','ffmpeg','anyaudio-tts','.tmp_meme','vault'}
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def copy(src,dst,workspace=False):
    if not src.exists() or src.is_symlink():return
    if src.is_dir():
        dst.mkdir(parents=True,exist_ok=True)
        for p in src.iterdir():
            if p.name in EXCLUDE or p.name.endswith(('.lock','-wal','-shm')) or '.bak' in p.name or '.before-' in p.name:continue
            if workspace and p.name=='voice':continue
            copy(p,dst/p.name,workspace)
    else:
        dst.parent.mkdir(parents=True,exist_ok=True)
        # SQLite backup API includes committed WAL pages without racing a live writer.
        if src.suffix in {'.db','.sqlite','.sqlite3'}:
            try:
                with sqlite3.connect('file:'+str(src)+'?mode=ro',uri=True) as a,sqlite3.connect(str(dst)) as b:a.backup(b)
                return
            except sqlite3.DatabaseError:pass
        shutil.copy2(src,dst)
def export(out):
    out=out.expanduser().resolve();out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():raise RuntimeError('输出文件已存在，不覆盖')
    with tempfile.TemporaryDirectory(prefix='huohuo-export-') as td:
        kit=Path(td)/'huohuo-kit';kit.mkdir(mode=0o700)
        copy(WORKSPACE,kit/'workspace',True)
        for rel in ['meme-packs','dsh-expression.json','douyin-browser/memory','secrets/breeze.key','secrets/onebot.token']:
            copy(USER_HOME/'.dsh'/rel,kit/'dsh'/rel)
        for rel in ['profiles/web/cordis.patch.yml','profiles/web/package.json','storages','sessions','memory','media/onebot','attachments','dsh-auto-memory.json','aik_auto_memory_use','.credentials.yaml']:
            copy(HARNESS/rel,kit/'harness'/rel)
        plugin=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
        if plugin.exists():copy(plugin.resolve()/'state',kit/'plugin-state/dsh-douyin-browser-local')
        q=USER_HOME/'Library/Containers/com.tencent.qq/Data'
        copy(q/'Library/Application Support/QQ/NapCat/config',kit/'napcat/config')
        copy(q/'Documents/loadNapCat.js',kit/'napcat/loadNapCat.js')
        copy(USER_HOME/'Library/LaunchAgents/com.huohuo.mediahttp.plist',kit/'launchagents/com.huohuo.mediahttp.plist')
        # Keep the validated action ledger but never ship queued voice jobs to a new machine.
        copy(WORKSPACE/'.state/douyin-actions.json',kit/'action-state/douyin-actions.json')
        copy(WORKSPACE/'.state/qzone.json',kit/'action-state/qzone.json')
        for rel in ['social-budget','watch-time','manual-comments.json','xhs-actions.json','xhs-messages.json','douyin-messages.json','social-plan.json','companion.json','social-inbox.json','douyin-inbox.json','xhs-comment-replies.json','douyin-comment-replies.json']:
            copy(WORKSPACE/'.state'/rel,kit/'action-state'/rel)
        (kit/'恢复.command').write_text('#!/bin/bash\nset -e\ncd "$(dirname "$0")"\npython3 workspace/migrate/kit.py restore --kit "$PWD"\n"$HOME/Documents/huohuo-qq/setup.sh"\necho "配置恢复完成；请登录账号并查看 MIGRATE.md，再启用定时任务。"\nread -r -p "按回车关闭"\n')
        (kit/'恢复.command').chmod(0o700)
        (kit/'MIGRATE.md').write_text((WORKSPACE/'migrate/MIGRATE.md').read_text())
        manifest={'version':2,'created':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_home':str(USER_HOME),'source_workspace':str(WORKSPACE),'source_arch':platform.machine(),'includes_credentials':True,'files':{}}
        for p in sorted(kit.rglob('*')):
            if p.is_file():manifest['files'][p.relative_to(kit).as_posix()]=digest(p)
        atomic_json(kit/'manifest.json',manifest)
        tmp=out.with_name(out.name+'.partial')
        try:
            with tarfile.open(tmp,'w:gz') as tar:tar.add(kit,arcname='huohuo-kit')
            tmp.chmod(0o600);os.replace(tmp,out)
        finally:
            if tmp.exists():tmp.unlink()
    print(json.dumps({'archive':str(out),'bytes':out.stat().st_size,'sha256':digest(out),'files':len(manifest['files'])},ensure_ascii=False))
def verify(kit):
    kit=kit.resolve();m=json.loads((kit/'manifest.json').read_text())
    if m.get('version')!=2:raise RuntimeError('不支持的迁移包版本')
    for name,expected in m['files'].items():
        rel=Path(name);p=kit/rel
        if rel.is_absolute() or '..' in rel.parts or p.is_symlink() or kit not in p.resolve().parents:raise RuntimeError('迁移包路径不合法')
        if not p.is_file() or digest(p)!=expected:raise RuntimeError('文件校验失败：'+name)
    for p in kit.rglob('*'):
        if p.is_symlink():raise RuntimeError('迁移包不允许符号链接')
        if p.is_file() and p.name!='manifest.json' and p.relative_to(kit).as_posix() not in m['files']:raise RuntimeError('存在未登记文件')
    return m

def restore(kit,target_home,dry=False):
    kit=kit.resolve();m=verify(kit);home=target_home.expanduser().resolve();w=home/'Documents/huohuo-qq';h=home/'Library/Application Support/dsh-desktop/harness'
    if home==Path.home().resolve():
        for pat in ['^/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop$','^/Applications/QQ.app/Contents/MacOS/QQ']:
            if subprocess.run(['pgrep','-f',pat],capture_output=True).returncode==0:raise RuntimeError('请先正常退出 DSH Desktop 和机器人 QQ，再恢复')
    stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S');backup=home/'Documents/huohuo-restore-backups'/stamp
    roots=[('workspace',w),('dsh',home/'.dsh'),('harness',h),('action-state',w/'.state'),('launchagents',home/'Library/LaunchAgents'),('napcat/config',home/'Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/config')]
    replacements=[(m['source_workspace'],str(w)),(m['source_home'],str(home))]
    imported=[];pending=[];written=0
    def relocate(data):
        try:s=data.decode('utf8')
        except UnicodeDecodeError:return data
        for a,b in replacements:s=s.replace(a,b)
        return s.encode()
    def write(src,dst):
        nonlocal written
        if dst.is_symlink():raise RuntimeError('目标为符号链接，拒绝覆盖：'+str(dst))
        if not home==dst and home not in dst.resolve().parents:raise RuntimeError('目标路径越界')
        raw=src.read_bytes()
        if src.suffix in TEXT:raw=relocate(raw)
        if dst.name=='automation-schedules.json':
            rules=json.loads(raw)
            for rule in rules:rule['enabled']=False
            raw=json.dumps(rules,ensure_ascii=False,indent=2).encode()
        if dst.name=='social-planner.json':
            policy=json.loads(raw);policy['enabled']=False;raw=json.dumps(policy,ensure_ascii=False,indent=2).encode()
        if dst.name=='social-plan.json':
            plan=json.loads(raw);plan['status']='imported-paused';raw=json.dumps(plan,ensure_ascii=False,indent=2).encode()
        if 'plugin-state' in dst.parts and dst.name in {'watch-schedule-policy.json','video-policy.json','chat-policy.json','share-policy.json','friend-interactions-policy.json','comments-policy.json','spark-policy.json'}:
            policy=json.loads(raw)
            if 'enabled' in policy:policy['enabled']=False
            raw=json.dumps(policy,ensure_ascii=False,indent=2).encode()
        if dst.name=='schedule.json':
            data=json.loads(raw)
            old=json.loads(dst.read_text()) if dst.exists() else {'unit':{'name':'schedule','version':1},'global':None,'tables':{'tasks':{}}}
            for key,task in data['tables']['tasks'].items():
                if key in old['tables']['tasks']:continue
                if task['status']=='active':imported.append(key);task['status']='inactive'
                old['tables']['tasks'][key]=task
            raw=json.dumps(old,ensure_ascii=False,indent=2).encode()
        if dry:written+=1;return
        dst.parent.mkdir(parents=True,exist_ok=True)
        if dst.exists():
            b=backup/dst.relative_to(home);b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dst,b)
        tmp=dst.with_name('.'+dst.name+'.restore');tmp.write_bytes(raw);tmp.chmod(0o700 if src.stat().st_mode & 0o111 or src.suffix in {'.sh','.command'} else 0o600);os.replace(tmp,dst);written+=1
    for source,dest in roots:
        root=kit/source
        if not root.exists():continue
        for src in sorted(root.rglob('*')):
            if not src.is_file():continue
            rel=str(src.relative_to(root))
            # Session storage directory encodes its workspace path.
            for old,new in replacements:rel=rel.replace(old.replace('/','-'),new.replace('/','-'))
            write(src,dest/rel)
    loader=kit/'napcat/loadNapCat.js'
    if loader.exists():write(loader,home/'Library/Containers/com.tencent.qq/Data/Documents/loadNapCat.js')
    # Defer generation-local state until DSH has installed plugins for this architecture.
    if (kit/'plugin-state').exists():
        for p in (kit/'plugin-state').rglob('*'):
            if p.is_file():write(p,w/'.migration/plugin-state'/p.relative_to(kit/'plugin-state'))
    if not dry:
        atomic_json(w/'.migration/pending-schedules.json',{'ids':imported,'note':'先停旧机器，确认新机器登录正常后，在 DSH 内重新安排未来时间；不补发过期任务。'})
        atomic_json(w/'.migration/restore.json',{'created':stamp,'source_arch':m['source_arch'],'target_arch':platform.machine(),'files':written,'backup':str(backup)})
        (home/'.dsh/secrets').mkdir(parents=True,exist_ok=True,mode=0o700)
        for p in (home/'.dsh/secrets').glob('*'):
            if p.is_file():p.chmod(0o600)
    print(json.dumps({'verified':True,'dry_run':dry,'files':written,'workspace':str(w),'imported_schedules_paused':len(imported),'backup':str(backup)},ensure_ascii=False))

def main():
    p=argparse.ArgumentParser();sp=p.add_subparsers(dest='action',required=True)
    e=sp.add_parser('export');e.add_argument('--out',type=Path,default=USER_HOME/'Desktop'/('huohuo-kit-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.tar.gz'))
    r=sp.add_parser('restore');r.add_argument('--kit',type=Path,required=True);r.add_argument('--target-home',type=Path,default=USER_HOME);r.add_argument('--dry-run',action='store_true')
    v=sp.add_parser('verify');v.add_argument('--kit',type=Path,required=True)
    a=p.parse_args()
    if a.action=='export':export(a.out)
    elif a.action=='restore':restore(a.kit,a.target_home,a.dry_run)
    else:print('Verified',len(verify(a.kit)['files']),'files')
if __name__=='__main__':
    try:main()
    except Exception as e:print('迁移失败：'+str(e),file=sys.stderr);sys.exit(1)
