#!/usr/bin/env python3
import argparse,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from runtime import onebot

def main():
 p=argparse.ArgumentParser();p.add_argument('action');p.add_argument('--json',default='{}');a=p.parse_args();data=json.loads(a.json)
 if a.action=='get_qzone_msg_list' and 'count' in data:data['num']=data.pop('count')
 if a.action!='send_qzone_msg':print(json.dumps(onebot(a.action,data),ensure_ascii=False));return
 raise ValueError('空间发布已改为真实日记流程：python3 qzone.py context → prepare --spec 稿件.json → publish --prepared 素材清单。不再直接发布未经校验的随口短句。')
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
