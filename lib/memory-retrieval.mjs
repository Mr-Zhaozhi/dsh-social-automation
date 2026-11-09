// Local lexical retrieval with small synonym expansion; no model/network calls.
import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const synonyms=[['散步','遛弯','溜达','走走'],['睡觉','睡眠','休息','入睡'],['吃饭','用餐','饮食'],['配音','声音','音色','语音'],['表情包','梗图','表情图'],['旅游','旅行','出游'],['游戏','玩游戏'],['工作','上班'],['生日','生辰'],['记得','记住','回忆'],['影片','视频','短片']];
const stop=new Set(['什么','怎么','一下','这个','那个','可以','已经','现在','然后','还是','之前','时候','我的','你的','我们','他们','没有','是不是','记得','记住','回忆']);
export function memoryTerms(value){
 let text=String(value||'').normalize('NFKC').toLowerCase();
 for(const group of synonyms)if(group.some(x=>text.includes(x)))text+=' '+group.join(' ');
 const terms=[];for(const part of text.match(/[a-z0-9_.-]{2,40}|[\p{Script=Han}]+/gu)||[]){if(/^[\p{Script=Han}]+$/u.test(part)){for(let i=0;i<part.length-1;i++)terms.push(part.slice(i,i+2));}else terms.push(part);}
 return [...new Set(terms.filter(x=>!stop.has(x)))].slice(0,160);
}
export function lexicalScore(query,text){const terms=memoryTerms(query),hay=new Set(memoryTerms(text));return terms.reduce((n,t)=>n+(hay.has(t)?1:0),0)/Math.sqrt(Math.max(1,hay.size));}
export function explicitFact(row){
 if(row.role!=='user'||row.status!=='received'||row.scope!=='owner')return null;
 const text=row.text.trim();if(text.length>160||/[\n“”"「」]|引用|转发|他说|她说/.test(text))return null;
 const prefix=text.match(/^(?:记住|请记住|更正|更新记忆|改一下记忆)[，,：:\s]*(.+?)[。！!]?$/);if(!prefix)return null;
 let m=prefix[1].match(/^我(?:现在|以后)?(?:最|更)?喜欢喝(.{1,40})$/);
 if(m)return {key:'饮品偏好',value:m[1],quote:text};
 m=prefix[1].match(/^我的([^，,。！？!?]{2,12}?)(?:改成|改为|现在是|是)([^。！？!?]{1,80})$/);
 if(!m||/权限|指令|账号|密码|密钥|身份|主人|称呼|昵称|规则|配置|系统/.test(m[1]))return null;
 return {key:m[1],value:m[2],quote:text};
}
export class MemoryIndex{
 constructor(root,now=()=>Date.now()){this.root=root;this.now=now;this.file=path.join(root,'.state/shared-context/recall.sqlite');}
 db(fn){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const db=new DatabaseSync(this.file);fs.chmodSync(this.file,0o600);try{
 db.exec(`PRAGMA busy_timeout=3000;CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,scope TEXT NOT NULL,at INTEGER NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL);CREATE INDEX IF NOT EXISTS event_scope_time ON events(scope,at);CREATE VIRTUAL TABLE IF NOT EXISTS terms USING fts5(id UNINDEXED,words);CREATE TABLE IF NOT EXISTS facts(source_id TEXT PRIMARY KEY,scope TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,quote TEXT NOT NULL,at INTEGER NOT NULL,superseded_by TEXT);CREATE INDEX IF NOT EXISTS fact_current ON facts(scope,key,superseded_by);`);
 return fn(db);}finally{db.close();}}
 ingest(rows){if(!rows.length)return;return this.db(db=>{db.exec('BEGIN IMMEDIATE');try{
 for(const row of [...rows].sort((a,b)=>a.at-b.at)){
  const prior=db.prepare('SELECT payload FROM events WHERE id=?').get(row.id);if(prior?.payload===JSON.stringify(row))continue;
  db.prepare('INSERT OR REPLACE INTO events VALUES(?,?,?,?,?,?)').run(row.id,row.scope,row.at,row.role,row.status,JSON.stringify(row));
  db.prepare('DELETE FROM terms WHERE id=?').run(row.id);db.prepare('INSERT INTO terms VALUES(?,?)').run(row.id,memoryTerms(row.text).join(' '));
  const fact=explicitFact(row);if(fact){
   db.prepare('INSERT OR IGNORE INTO facts VALUES(?,?,?,?,?,?,NULL)').run(row.id,row.scope,fact.key,fact.value,fact.quote,row.at);
   const newest=db.prepare('SELECT source_id FROM facts WHERE scope=? AND key=? ORDER BY at DESC,source_id DESC LIMIT 1').get(row.scope,fact.key);
   db.prepare('UPDATE facts SET superseded_by=CASE WHEN source_id=? THEN NULL ELSE ? END WHERE scope=? AND key=?').run(newest.source_id,newest.source_id,row.scope,fact.key);
  }
 }
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}});}
 search(route,query,{limit=8}={}){const tokens=memoryTerms(query).slice(0,48);if(!tokens.length||!fs.existsSync(this.file))return [];return this.db(db=>{
 const match=tokens.map(x=>'"'+x.replaceAll('"','""')+'"').join(' OR ');
 const scopes=route.owner?"(e.scope='public' OR e.scope='owner' OR e.scope LIKE 'group:%')":"(e.scope='public' OR e.scope=?)";
 const params=[match,...(route.owner?[]:[route.scope]),this.now()-90*86400000,Math.min(20,limit)];
 return db.prepare(`SELECT e.payload,bm25(terms) AS rank FROM terms JOIN events e ON e.id=terms.id WHERE terms MATCH ? AND ${scopes} AND (e.at>=? OR e.id IN(SELECT source_id FROM facts WHERE superseded_by IS NULL)) AND e.id NOT IN(SELECT source_id FROM facts WHERE superseded_by IS NOT NULL) ORDER BY rank,e.at DESC LIMIT ?`).all(...params).map(x=>JSON.parse(x.payload));
 });}
 facts(route,query=''){if(!fs.existsSync(this.file)||!route.owner)return [];return this.db(db=>db.prepare('SELECT source_id AS sourceId,key,value,quote,at FROM facts WHERE scope=? AND superseded_by IS NULL ORDER BY at DESC LIMIT 100').all(route.scope)).sort((a,b)=>lexicalScore(query,b.key+b.value)-lexicalScore(query,a.key+a.value)||b.at-a.at).slice(0,6);}
 superseded(){if(!fs.existsSync(this.file))return new Set();return this.db(db=>new Set(db.prepare('SELECT source_id FROM facts WHERE superseded_by IS NOT NULL').all().map(x=>x.source_id)));}
 prune(){if(!fs.existsSync(this.file))return;this.db(db=>{db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM events WHERE id NOT IN(SELECT source_id FROM facts WHERE superseded_by IS NULL) AND (at<? OR id NOT IN(SELECT id FROM events ORDER BY at DESC LIMIT 10000))').run(this.now()-90*86400000);db.exec('DELETE FROM terms WHERE id NOT IN(SELECT id FROM events);DELETE FROM facts WHERE source_id NOT IN(SELECT id FROM events);COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}});}
 stats(){if(!fs.existsSync(this.file))return {indexed:0,currentFacts:0};return this.db(db=>({indexed:db.prepare('SELECT count(*) AS n FROM events').get().n,currentFacts:db.prepare('SELECT count(*) AS n FROM facts WHERE superseded_by IS NULL').get().n}));}
}
export function selectLongTerm(text,query,limit=900){
 const chunks=String(text).slice(0,40000).split(/\n\s*\n|(?=^#{1,4} )/m).map(x=>x.trim()).filter(Boolean);
 const ranked=chunks.map((text,i)=>({text,i,score:lexicalScore(query,text)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 let out='';for(const x of ranked){const piece=x.text.slice(0,450);if(out.length+piece.length+2>limit)continue;out+=(out?'\n\n':'')+piece;}
 return out;
}

export function memoryExcerpt(text,query,limit=600){
 const terms=memoryTerms(query),value=String(text);if(value.length<=limit)return value;
 let best=0,score=-1;for(let start=0;start<value.length;start+=120){const chunk=value.slice(start,start+limit),n=terms.filter(x=>chunk.includes(x)).length;if(n>score){score=n;best=start;}}
 return (best?'…':'')+value.slice(best,best+limit-2)+(best+limit<value.length?'…':'');
}
