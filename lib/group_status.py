"""Read the authoritative group policy without scanning history or runtime files."""
import json
from runtime import config

def status(cfg):
    return {'enabled_groups':[{'id':str(key),'name':value.get('name',str(key))} for key,value in cfg.get('qq_groups',{}).items() if value.get('enabled') is True],
            'enable_command':'新增主动群 群号（也支持唯一群名）',
            'requirements':'机器人先入群；主人在私聊发送开启指令。未开启免艾特接话的群请艾特机器人。',
            'changed':False}

if __name__=='__main__':print(json.dumps(status(config()),ensure_ascii=False))
