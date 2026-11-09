import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {workspace} from '../lib/runtime.mjs';
test('migration and fleet CLIs execute from paths containing spaces and Chinese text',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'huohuo-cli-')),root=path.join(tmp,'new Mac 中文');t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 for(const name of ['lib/runtime.mjs','lib/github-cli.mjs','lib/fleet.mjs','migrate/vault.mjs']){const dst=path.join(root,name);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(workspace,name),dst);}
 fs.writeFileSync(path.join(root,'automation.json'),'{}');fs.writeFileSync(path.join(root,'sync.json'),'{"enabled":false}');
 const env={...process.env,HUOHUO_WORKSPACE:root};
 const fleet=spawnSync(process.execPath,[path.join(root,'lib/fleet.mjs')],{env,encoding:'utf8'});assert.equal(fleet.status,0,fleet.stderr);assert.equal(fleet.stdout.trim(),'active');
 const vault=spawnSync(process.execPath,[path.join(root,'migrate/vault.mjs'),'invalid-command'],{env,encoding:'utf8'});assert.equal(vault.status,1);assert.match(vault.stderr,/用法 vault.mjs/);
});
