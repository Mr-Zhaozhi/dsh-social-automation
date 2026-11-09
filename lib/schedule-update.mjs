// DSH list() returns active records without a status field; timing edits use change.
export async function reschedule(service, rule, at, content={}) {
 const expected=(await service.list({sessionId:rule.sessionId})).find(t=>t.id===rule.id);
 if(!expected)throw new Error('仅可调整当前有效任务');
 const result=await service.update({sessionId:rule.sessionId,id:rule.id,expected,change:{kind:'at',at},...content});
 if(result.record?.scheduledAt!==at)throw new Error('任务时间未保存：'+(result.code||'返回时间不一致'));
 const saved=(await service.list({sessionId:rule.sessionId})).find(t=>t.id===rule.id);
 if(saved?.scheduledAt!==at)throw new Error('任务时间回读不一致');
 return saved;
}
