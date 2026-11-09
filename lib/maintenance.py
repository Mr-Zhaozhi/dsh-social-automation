"""Bounded, allowlisted retention. No recursive deletion of application state."""
import argparse,fcntl,json,os,stat,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CACHE_DIRS={'incoming-media','video-audio','video-understanding','life-sources','preview'}
DEPLOY_DIRS={'share-components'}
def candidates(root,now=None):
 now=time.time() if now is None else now
 state=root/'.state'
 if state.is_symlink():return
 for base,dirs,files in os.walk(state,followlinks=False):
  dirs[:]=[d for d in dirs if not (Path(base)/d).is_symlink()]
  for name in files:
   p=Path(base)/name;rel=p.relative_to(state);first=rel.parts[0]
   if p.is_symlink() or name in {'budget.json','budget.lock'} or name.endswith(('.lock','.sqlite','.sqlite-wal','.sqlite-shm')):continue
   if first in CACHE_DIRS and p.suffix=='.json':
    try:
     if json.loads(p.read_text()).get('status') in {'pending','running','queued','sending','unknown'}:continue
    except (ValueError,AttributeError,OSError):continue
   days=None
   if p.suffix=='.log' or '.log.' in name:days=7
   elif first in CACHE_DIRS:days=3
   elif first in DEPLOY_DIRS or (len(rel.parts)==1 and name.startswith('obsolete-deploy-build') and name.endswith('.zip')):days=7
   if days is None:continue
   s=p.stat()
   if stat.S_ISREG(s.st_mode) and now-s.st_mtime>days*86400:yield p,s

def open_files():
 r=subprocess.run(['/usr/sbin/lsof','-nP','-Fn'],capture_output=True,text=True,timeout=30)
 if r.returncode not in (0,1) or not r.stdout.strip():raise RuntimeError('无法确认打开的文件，本次不清理')
 return {line[1:] for line in r.stdout.splitlines() if line.startswith('n/')}

def clean(root,apply=False,opened=None,now=None):
 opened={str(Path(p).resolve()) for p in (open_files() if opened is None else opened)}
 report={'at':time.time(),'applied':apply,'files':0,'bytes':0,'skippedOpen':0,'errors':0,'policy':{'logsDays':7,'cacheDays':3,'obsoleteDeploymentDays':7}}
 for p,before in candidates(root,now):
  if str(p.resolve()) in opened:report['skippedOpen']+=1;continue
  try:
   after=p.lstat()
   if (before.st_ino,before.st_mtime_ns,before.st_size)!=(after.st_ino,after.st_mtime_ns,after.st_size) or not stat.S_ISREG(after.st_mode):continue
   if apply:p.unlink()
   report['files']+=1;report['bytes']+=before.st_size
  except OSError:report['errors']+=1
 return report

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');a=parser.parse_args()
 state=ROOT/'.state';state.mkdir(exist_ok=True)
 with (state/'maintenance.lock').open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return
  report=clean(ROOT,a.apply)
  tmp=state/'maintenance-report.json.tmp';tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2));os.replace(tmp,state/'maintenance-report.json');print(json.dumps(report))
if __name__=='__main__':main()
