#!/usr/bin/env python3
"""Local DSH Douyin settings client; never prints settings tokens."""
import argparse,json,urllib.request,urllib.error
BASE='http://127.0.0.1:43129/api/douyin-browser'
def request(route='state',body=None):
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 state=json.load(opener.open(BASE+'/state',timeout=15))
 if body is None:return state
 req=urllib.request.Request(BASE+'/'+route,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:43129','x-douyin-settings-token':state['token']},method='POST')
 return json.load(opener.open(req,timeout=40))
def main():
 p=argparse.ArgumentParser();p.add_argument('route',nargs='?',default='state');p.add_argument('--json');a=p.parse_args()
 d=request(a.route,json.loads(a.json) if a.json else None)
 if a.route=='state':d={k:d.get(k) for k in ['schedule','watch','video','comments']}
 d.pop('token',None);print(json.dumps(d,ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except urllib.error.HTTPError as e:print('抖音控制失败：'+str(e.code)+' '+e.read().decode()[:500]);raise SystemExit(1)
 except Exception as e:print('抖音控制失败：'+str(e));raise SystemExit(1)
