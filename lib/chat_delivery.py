"""Apply quiet QQ delivery using the plugin's native settings, preserving other rows."""
import re,os,tempfile
from runtime import HARNESS

def quiet_patch(text):
    match=re.search(r'^- id: dsh-onebot\n(?:(?!^- ).*\n)*',text,re.M)
    if not match:raise ValueError('未找到 dsh-onebot 配置，未修改')
    row=match.group()
    if '  config:\n' not in row:raise ValueError('OneBot 配置结构改变，未修改')
    for key,value in [('interimMessages','false')]:
        line=f'    {key}: {value}\n'
        if re.search(r'^    '+key+r':.*$',row,re.M):row=re.sub(r'^    '+key+r':.*\n',line,row,flags=re.M)
        else:row=row.replace('  config:\n','  config:\n'+line,1)
    # Preserve error, timeout and rate-limit warnings: only redundant acknowledgements are muted.
    notices=re.search(r'^    notices:\n(?:^      .*\n)*',row,re.M)
    block=notices.group() if notices else '    notices:\n'
    for key in ('queue','steerAccepted','answerAccepted'):
        line=f'      {key}: false\n'
        if re.search(r'^      '+key+r':',block,re.M):block=re.sub(r'^      '+key+r':.*\n',line,block,flags=re.M)
        else:block+=line
    if notices:row=row[:notices.start()]+block+row[notices.end():]
    else:row=row.replace('  config:\n','  config:\n'+block,1)
    return text[:match.start()]+row+text[match.end():]

def install():
    path=HARNESS/'profiles/web/cordis.patch.yml'
    if not path.exists():return 'QQ 配置未安装，跳过静默回执设置'
    before=path.read_text();after=quiet_patch(before)
    if after!=before:
        fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.quiet-chat-')
        try:
            with os.fdopen(fd,'w') as f:f.write(after)
            os.chmod(tmp,path.stat().st_mode & 0o777);os.replace(tmp,path)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    return 'QQ 已关闭排队自动回执及中间过程消息，正常回复和失败提醒保留'

if __name__=='__main__':print(install())
