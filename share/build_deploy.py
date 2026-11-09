#!/usr/bin/env python3
"""Assemble a complete Mac deployment kit from clean source and public installers."""
import argparse,hashlib,importlib.util,json,os,shutil,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_export',ROOT/'share/export.py');source_export=importlib.util.module_from_spec(spec);spec.loader.exec_module(source_export)
spec=importlib.util.spec_from_file_location('deploy_install',ROOT/'share/deploy_install.py');deploy_install=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy_install)
ASSETS=['huohuo-self-happy.png','huohuo-self-sleep.png','huohuo-self-sleep.gif']

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def build(destination,cache):
 destination=destination.resolve();cache=cache.resolve()
 if destination.exists():raise FileExistsError('输出文件已存在')
 manifest=json.loads((ROOT/'share/components.json').read_text())
 for item in manifest['components']:deploy_install.verify_component(cache/item['file'],item)
 with tempfile.TemporaryDirectory(prefix='dsh-complete-kit-') as td:
  temp=Path(td);kit=temp/'DSH-Automation-Deploy-Mac';kit.mkdir()
  source_export.build(ROOT,temp/'source.zip')
  with zipfile.ZipFile(temp/'source.zip') as z:
   z.extractall(temp)
   for item in z.infolist():
    if item.external_attr>>16:(temp/item.filename).chmod((item.external_attr>>16)&0o777)
  workspace=kit/'workspace';(temp/'DSH-Automation-Share').rename(workspace)
  for name in ASSETS:
   origin=ROOT/'share/starter-assets'/name
   if not origin.exists():origin=ROOT/'memes'/name
   if not origin.is_file() or origin.is_symlink():raise RuntimeError('缺少已核对的公共角色素材：'+name)
   shutil.copyfile(origin,workspace/'memes'/name)
  (workspace/'memes/README.md').write_text('本完整部署包附带三份已检查的卡通角色素材（两张 PNG 和一份 GIF），用于表情回复与视频制作。没有真人照片或聊天附件。素材中的角色可自行改名；自己的语音 Key 和音色 ID 仍需单独配置。\n')
  for name in ['MANIFEST.json','PRIVACY-CHECK.json']:(workspace/name).unlink()
  files={str(p.relative_to(workspace)):sha(p) for p in sorted(workspace.rglob('*')) if p.is_file()}
  source_export.write_json(workspace/'MANIFEST.json',{'format':1,'edition':'clean-deployment-source','files':files})
  source_export.write_json(workspace/'PRIVACY-CHECK.json',{'passed':True,'accounts_and_credentials_included':False,'automations_enabled':False,'public_character_assets':ASSETS,'private_attachments_and_history_included':False})
  components=kit/'components';components.mkdir()
  for item in manifest['components']:
   # A hardlink saves another gigabyte of staging copies. ZIP still stores
   # ordinary independent files; links never appear in the delivered archive.
   try:os.link(cache/item['file'],components/item['file'])
   except OSError:shutil.copyfile(cache/item['file'],components/item['file'])
  shutil.copyfile(ROOT/'share/components.json',components/'components.json')
  installer=(ROOT/'share/deploy-bootstrap.command').read_text()
  for item in manifest['components']:
   if item['kind']=='dsh':installer=installer.replace('@DSH_'+item['arch'].upper()+'_SHA512@',item['hash'])
  (kit/'开始安装.command').write_text(installer);(kit/'开始安装.command').chmod(0o755)
  shutil.copyfile(ROOT/'share/完整部署说明.md',kit/'先读我-完整部署说明.md')
  shutil.copyfile(ROOT/'share/THIRD-PARTY-NOTICES.md',kit/'THIRD-PARTY-NOTICES.md')
  for p in (ROOT/'share/licenses').glob('*'):
   if p.is_file():(kit/'licenses').mkdir(exist_ok=True);shutil.copyfile(p,kit/'licenses'/p.name)
  # Scan all source/config/docs; binaries are separately pinned public files
  # or the explicit three-asset allowlist, never copied from user profiles.
  denied=source_export.private_values(ROOT)
  for p in kit.rglob('*'):
   if not p.is_file() or p.parent==components and p.name!='components.json' or p.name in ASSETS:continue
   if any(v in p.read_text() for v in denied):raise RuntimeError('隐私检查失败：'+str(p.relative_to(kit)))
  info={'format':1,'edition':'complete-mac-deployment','files':{str(p.relative_to(kit)):sha(p) for p in kit.rglob('*') if p.is_file()},'requires_personal_login':True,'requires_network_for_plugin_dependencies':True,'actual_m1_tested':False}
  source_export.write_json(kit/'DEPLOYMENT-MANIFEST.json',info)
  destination.parent.mkdir(parents=True,exist_ok=True)
  with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
   for p in sorted(kit.rglob('*')):
    if p.is_file():z.write(p,p.relative_to(temp),compress_type=zipfile.ZIP_STORED if p.suffix in {'.zip','.dmg','.gz','.bz2','.tgz','.png','.gif'} else zipfile.ZIP_DEFLATED)
  return {'archive':str(destination),'bytes':destination.stat().st_size,'sha256':sha(destination),'files':len(info['files'])+1,'privacy':'passed'}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--cache',type=Path,default=ROOT/'.state/share-components');a=p.parse_args();print(json.dumps(build(a.output,a.cache),ensure_ascii=False,indent=2))
