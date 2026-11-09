import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {browseSelection} from '../lib/browse-policy.mjs';
test('chosen feed is gated by current ready plan and future start without disabling inboxes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'browse-choice-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'.state'));
 const file=path.join(root,'.state/social-plan.json'),date='2026-11-07',opts={root,date,now:Date.parse(date+'T12:00:00+08:00')};
 const plan={policyVersion:2,browsePlatform:'xiaohongshu',browseMinute:600};const write=(state)=>fs.writeFileSync(file,JSON.stringify(state));
 assert.equal(browseSelection('xiaohongshu',opts).allowed,false);
 write({date,status:'ready',plan});assert.equal(browseSelection('xiaohongshu',opts).allowed,true);assert.equal(browseSelection('douyin',opts).allowed,false);assert.equal(browseSelection('zhihu',opts).allowed,false);
 assert.equal(browseSelection('xiaohongshu',{...opts,now:Date.parse(date+'T09:00:00+08:00')}).allowed,false);
 write({date,status:'applying',plan});assert.equal(browseSelection('xiaohongshu',opts).allowed,false);
 write({date:'2026-11-06',status:'ready',plan});assert.equal(browseSelection('xiaohongshu',opts).allowed,false);
 write({date,status:'ready',plan:{...plan,browsePlatform:'none'}});assert.equal(browseSelection('xiaohongshu',opts).allowed,false);
});
