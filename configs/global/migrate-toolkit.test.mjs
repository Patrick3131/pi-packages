import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const script=resolve('configs/global/migrate-toolkit.py');
const source='git:github.com/Patrick3131/pi-packages';
test('toolkit migration previews, preserves selectors/preferences, backs up once and repeats without writes',t=>{
 const dir=mkdtempSync(join(tmpdir(),'toolkit-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const original={defaultModel:'personal',packages:[{source,extensions:['!packages/pi-tools/**','+packages/pi-presets/src/preset.ts','!packages/pi-keepalive/**'],skills:[]},'npm:other'],extensions:['/home/user/pi-packages/packages/pi-skill-mentions/src/index.ts']};
 const path=join(dir,'settings.json');writeFileSync(path,JSON.stringify(original));
 const run=(...args)=>spawnSync('python3',[script,'--agent-dir',dir,...args],{encoding:'utf8'});
 assert.equal(run().status,0);assert.deepEqual(JSON.parse(readFileSync(path)),original);assert.equal(readdirSync(dir).length,1);
 assert.equal(run('--apply').status,0);const migrated=JSON.parse(readFileSync(path));assert.equal(migrated.defaultModel,'personal');assert.deepEqual(migrated.packages[0].skills,[]);assert.deepEqual(migrated.packages[0].extensions,['!packages/pi-toolkit/src/features/tools/**','+packages/pi-toolkit/src/features/presets/index.ts','!packages/pi-keepalive/**']);assert.ok(migrated.extensions[0].endsWith('/pi-toolkit/src/features/skill-mentions/index.ts'));assert.equal(readdirSync(dir).length,2);
 const before=readFileSync(path,'utf8');assert.equal(run('--apply').status,0);assert.equal(readFileSync(path,'utf8'),before);assert.equal(readdirSync(dir).length,2);
 const backup=join(dir,readdirSync(dir).find(n=>n.startsWith('settings.json.toolkit-backup-')));
 migrated.defaultModel='later-personal';writeFileSync(path,JSON.stringify(migrated));
 assert.equal(run('--rollback',backup,'--apply').status,0);
 const restored=JSON.parse(readFileSync(path));assert.deepEqual(restored.packages,original.packages);assert.deepEqual(restored.extensions,original.extensions);assert.equal(restored.defaultModel,'later-personal');
});
test('standalone first-party declarations are consolidated without enabling unrelated features; ambiguous or malformed settings fail without mutation',t=>{
 const dir=mkdtempSync(join(tmpdir(),'toolkit-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'settings.json');
 const run=()=>spawnSync('python3',[script,'--agent-dir',dir,'--apply'],{encoding:'utf8'});
 const unrelated={source:'npm:other',extensions:['packages/pi-tools/src/*.ts'],skills:[]};
 writeFileSync(path,JSON.stringify({packages:['/home/u/pi-packages/packages/pi-tools',unrelated]}));assert.equal(run().status,0);const packages=JSON.parse(readFileSync(path)).packages;assert.equal(packages.length,2);assert.deepEqual(packages[0],unrelated);assert.equal(packages[1].source,source);assert.deepEqual(packages[1].extensions,['packages/pi-toolkit/src/features/tools/**']);assert.deepEqual(packages[1].skills,[]);
 for(const value of ['{broken',JSON.stringify({packages:[{source,extensions:['packages/pi-*/src/*.ts']}]}),JSON.stringify({packages:[{source,extensions:['packages/pi-tools/src/tool*.ts']}]})]){writeFileSync(path,value);const count=readdirSync(dir).length;assert.notEqual(run().status,0);assert.equal(readFileSync(path,'utf8'),value);assert.equal(readdirSync(dir).length,count);}
});
