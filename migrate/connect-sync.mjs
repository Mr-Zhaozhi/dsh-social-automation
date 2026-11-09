import fs from 'node:fs';import path from 'node:path';import {workspace,atomicJSON,day} from '../lib/runtime.mjs';import {gh,identity,heartbeat,syncExistingBudgets} from '../lib/fleet.mjs';import {seedLegacyBudgets} from '../lib/budget-history.mjs';
const cfg=JSON.parse(fs.readFileSync(path.join(workspace,'sync.json'))),repo=JSON.parse(await gh(['api','repos/'+cfg.repository]));
if(repo.private!==true)throw new Error('同步只允许私有仓库');
seedLegacyBudgets();
const branches=JSON.parse(await gh(['api','repos/'+cfg.repository+'/branches?per_page=100']));
if(!branches.some(b=>b.name==='runtime')){const main=branches.find(b=>b.name===cfg.branch);if(!main)throw new Error('缺少代码分支');await gh(['api','repos/'+cfg.repository+'/git/refs','--method','POST','--input','-'],JSON.stringify({ref:'refs/heads/runtime',sha:main.commit.sha}));}
const entries=JSON.parse(await gh(['api','repos/'+cfg.repository+'/contents?ref=runtime']));
if(!entries.some(e=>e.path==='runtime')){
 const budgets={};for(const platform of ['douyin','xiaohongshu'])for(const kind of ['private','comment','post']){const f=path.join(workspace,`.state/social-budget/${platform}-${kind}.json`);if(fs.existsSync(f))budgets[`${day()}:${platform}:${kind}`]=JSON.parse(fs.readFileSync(f)).entries.filter(e=>e.date===day()&&e.status!=='not-sent').map(e=>({id:e.id,units:e.units||1}));}
 const owner=identity(),watchOwners=Object.fromEntries(['douyin','xiaohongshu'].map(platform=>[day()+':'+platform,owner]));
 const state={version:1,owner,until:Date.now()+300000,budgets,watchOwners};await gh(['api','repos/'+cfg.repository+'/contents/runtime/fleet.json','--method','PUT','--input','-'],JSON.stringify({branch:'runtime',message:'Initialize shared automation coordinator',content:Buffer.from(JSON.stringify(state)).toString('base64')}));
}
await gh(['auth','setup-git','--hostname','github.com']);cfg.enabled=true;atomicJSON(path.join(workspace,'sync.json'),cfg);const state=await heartbeat();if(state.status==='active')await syncExistingBudgets();console.log(JSON.stringify(state));
