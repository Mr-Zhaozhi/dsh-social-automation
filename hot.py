#!/usr/bin/env python3
"""Bounded parallel news reads; failures are explicit and no stale success is invented."""
import sys,json,urllib.request,xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
HOT={'weibo':('KqndgxeLl9','微博热搜'),'douyin':('DpQvNABoNE','抖音热点'),'zhihu':('mproPpoq6O','知乎热榜')}
NEWS=[('https://www.ithome.com/rss/','IT之家'),('https://www.solidot.org/index.rss','Solidot'),('https://sspai.com/feed','少数派')]
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=12) as r:
  b=r.read(2*1024*1024+1)
  if len(b)>2*1024*1024:raise ValueError('响应过大')
  return b

def fetch(job):
 kind,arg,name=job
 try:
  if kind=='hot':
   data=json.loads(get('https://api.codelife.cc/api/top/list?lang=cn&id='+arg)).get('data',[])
   lines=[x.get('title','') for x in data[:12]]
  elif kind=='rss':
   root=ET.fromstring(get(arg));items=root.findall('.//item') or root.findall('.//{http://www.w3.org/2005/Atom}entry')
   lines=[(x.findtext('title') or x.findtext('{http://www.w3.org/2005/Atom}title') or '').strip() for x in items[:8]]
  else:
   data=json.loads(get('https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1'));lines=[x['title'] for x in data.get('data',{}).get('list',[])]
  lines=[s for s in lines if s]
  if not lines:raise ValueError('无有效条目')
  return True,'【'+name+'】\n'+'\n'.join('- '+x for x in lines)
 except Exception as e:return False,'【'+name+'】抓取失败：'+str(e)[:120]
def main():
 what=sys.argv[1] if len(sys.argv)>1 else 'all'
 if what in ('ithome','toutiao'):
  from news import load
  d=load(what);print('【'+what+'】\n'+'\n'.join(x['title']+'\n'+x['url'] for x in d['items'][:12]));return
 if what not in ['all','news','bili','ithome','toutiao',*HOT]:raise SystemExit('用法: all|weibo|douyin|zhihu|news|bili')
 jobs=[('hot',v[0],v[1]) for k,v in HOT.items() if what in ('all',k)]
 if what in ('all','news'):jobs += [('rss',u,n) for u,n in NEWS]
 if what in ('all','bili'):jobs.append(('bili','','B站热门'))
 with ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(fetch,jobs))
 print('\n\n'.join(t for _,t in rows))
 if not any(ok for ok,_ in rows):sys.exit(1)
if __name__=='__main__':main()
