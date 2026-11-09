#!/usr/bin/env python3
"""Public news feeds, cached 30 minutes. No account/browser/model required."""
import json,sys,time,hashlib,os
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
from hot import get
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ('script','style'):self.skip+=1
  if t in ('p','br','div'):self.parts.append('\n')
 def handle_endtag(self,t):
  if t in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,s):
  if not self.skip:self.parts.append(s)
def plain(s):
 p=Text();p.feed(s);return '\n'.join(x.strip() for x in ''.join(p.parts).splitlines() if x.strip())
def valid(url,host):
 u=urlparse(url);return u.scheme=='https' and u.hostname==host and not u.username and not u.port

def fetch(source):
 if source=='ithome':
  root=ET.fromstring(get('https://www.ithome.com/rss/'))
  return [{'title':x.findtext('title'),'url':x.findtext('link'),'publishedAt':x.findtext('pubDate'),'text':plain(x.findtext('description') or '')[:6500],'scope':'rss-content'} for x in root.findall('.//item')[:60] if valid(x.findtext('link') or '', 'www.ithome.com')]
 if source=='toutiao':
  data=json.loads(get('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc'))
  return [{'title':x['Title'],'url':x['Url'].split('?')[0],'text':x['Title'],'scope':'headline-only'} for x in data.get('data',[])[:50] if x.get('Title') and valid(x.get('Url',''),'www.toutiao.com')]
 raise ValueError('source must be ithome or toutiao')
def load(source):
 if source not in ('ithome','toutiao'):raise ValueError('unknown source')
 f=Path(__file__).resolve().parent/'.state/news'/f'{source}.json'
 try:
  old=json.loads(f.read_text())
  if 0<=time.time()-old['fetchedAt']<1800:return {**old,'cached':True}
 except (OSError,ValueError,KeyError):pass
 rows=fetch(source)
 if not rows:raise ValueError('新闻源没有有效内容')
 data={'source':source,'fetchedAt':time.time(),'items':rows,'cached':False}
 f.parent.mkdir(parents=True,exist_ok=True);tmp=f.with_suffix('.'+str(os.getpid())+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False));tmp.replace(f)
 return data
def read_item(source,url):
 d=load(source)
 row=next((x for x in d['items'] if x['url']==url),None)
 if not row:raise ValueError('链接不在当前新闻列表，请先刷新列表')
 if source=='ithome':return {**row,'complete':False,'note':'RSS报道内容，可能节选；未声称网页全文'}
 import subprocess
 r=subprocess.run([str(Path(__file__).resolve().parent/'node-run.sh'),str(Path(__file__).resolve().parent/'news-read.mjs'),url],capture_output=True,text=True,timeout=60)
 if r.returncode:raise ValueError(r.stdout[:600] or '正文读取失败')
 return json.loads(r.stdout)
if __name__=='__main__':
 try:print(json.dumps(read_item(sys.argv[2],sys.argv[3]) if len(sys.argv)>1 and sys.argv[1]=='read' else load(sys.argv[1] if len(sys.argv)>1 else 'ithome'),ensure_ascii=False))
 except Exception as e:print(json.dumps({'error':str(e)[:200]},ensure_ascii=False));sys.exit(1)
