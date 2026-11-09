import {assertPlatformAvailable} from './platform-holds.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {workspace,atomicJSON,day} from './runtime.mjs';
import {assertRunner,globalBudget} from './fleet.mjs';

// One durable budget per platform; pending/unknown deliveries consume a slot.
export class SocialBudget {
  constructor({root=path.join(workspace,'.state/social-budget'),today=day}={}){this.root=root;this.today=today;}
  seed(platform,kind,history=[]){
    return this.transaction(platform,kind,state=>{
      if(state.seeded)return;
      for(const row of history){const date=String(row.date||row.day||'');if(/^\d{4}-\d{2}-\d{2}$/.test(date))state.entries.push({id:'import-'+randomUUID(),date,status:'confirmed',target:'imported'});}
      state.seeded=true;
    });
  }
  transaction(platform,kind,fn){
    if(!['douyin','xiaohongshu','zhihu'].includes(platform)||!['private','comment','post'].includes(kind))throw new Error('无效的互动预算');
    fs.mkdirSync(this.root,{recursive:true});const file=path.join(this.root,platform+'-'+kind+'.json'),guard=file+'.lock';
    let fd;try{fd=fs.openSync(guard,'wx',0o600);}catch{throw new Error('互动预算正在写入或上次事务需核对，未继续发送');}
    try{
      let state={version:1,entries:[],seeded:false};
      if(fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));
      if(state.version!==1||!Array.isArray(state.entries)||state.entries.some(e=>!e.id||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isInteger(e.units??1)||(e.units??1)<1||(e.units??1)>100||!['pending','confirmed','unknown','not-sent'].includes(e.status)))throw new Error('互动预算记录损坏，未清空或继续发送');
      const result=fn(state);atomicJSON(file,state);return result;
    }finally{fs.closeSync(fd);fs.unlinkSync(guard);}
  }
  reserve(platform,kind,target,history=[],units=1){
    const limit={private:15,comment:100,post:1}[kind];
    if(!Number.isInteger(units)||units<1||units>limit)throw new Error('无效发送条数');
    return this.transaction(platform,kind,state=>{
      if(!state.seeded){
        for(const row of history){const date=String(row.date||row.day||'');if(/^\d{4}-\d{2}-\d{2}$/.test(date))state.entries.push({id:'import-'+randomUUID(),date,status:'confirmed',target:'imported'});}
        state.seeded=true;
      }
      const date=this.today(),used=state.entries.filter(e=>e.date===date&&e.status!=='not-sent').reduce((s,e)=>s+(e.units??1),0);
      if(used+units>limit)throw Object.assign(new Error(`${platform} 今日${kind==='private'?'私信（含私聊分享）':kind==='comment'?'评论':'发布'}已达 ${limit} 条上限`),{code:'SOCIAL_DAILY_LIMIT',beforeDelivery:true});
      const id=randomUUID();state.entries.push({id,date,status:'pending',units,target:String(target).slice(0,500),at:new Date().toISOString()});return id;
    });
  }
  remaining(platform,kind){
    if(!['douyin','xiaohongshu','zhihu'].includes(platform)||!['private','comment','post'].includes(kind))throw new Error('无效的互动预算');
    const file=path.join(this.root,platform+'-'+kind+'.json');if(!fs.existsSync(file))return {private:15,comment:100,post:1}[kind];
    const state=JSON.parse(fs.readFileSync(file));
    if(state.version!==1||!Array.isArray(state.entries)||state.entries.some(e=>!Number.isInteger(e.units??1)||(e.units??1)<1||!['pending','confirmed','unknown','not-sent'].includes(e.status)))throw new Error('互动预算记录损坏');
    return Math.max(0,{private:15,comment:100,post:1}[kind]-state.entries.filter(e=>e.date===this.today()&&e.status!=='not-sent').reduce((s,e)=>s+(e.units??1),0));
  }
  finish(platform,kind,id,status){return this.transaction(platform,kind,state=>{const row=state.entries.find(e=>e.id===id);if(!row)throw new Error('缺少发送预算预约');if(!['confirmed','unknown','not-sent'].includes(status))throw new Error('无效发送结果');row.status=status;});}
  async run(platform,kind,target,callback,history=[],units=1){
    const shared=this===socialBudget;if(shared){assertPlatformAvailable(platform);await assertRunner();}
    const id=this.reserve(platform,kind,target,history,units);
    if(shared){try{await globalBudget(platform,kind,units,id);}catch(e){this.finish(platform,kind,id,'not-sent');throw e;}}
    try{if(shared)assertPlatformAvailable(platform);const result=await callback();this.finish(platform,kind,id,result?.confirmed===true?'confirmed':result?.deliveryUncertain===false?'not-sent':'unknown');if(shared&&result?.confirmed!==true&&result?.deliveryUncertain===false)await globalBudget(platform,kind,units,id,true).catch(()=>{});return result;}
    catch(e){this.finish(platform,kind,id,e.beforeDelivery===true?'not-sent':'unknown');if(shared&&e.beforeDelivery===true)await globalBudget(platform,kind,units,id,true).catch(()=>{});throw e;}
  }
}
export const socialBudget=new SocialBudget();
