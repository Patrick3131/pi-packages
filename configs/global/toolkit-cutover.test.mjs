import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('toolkit-only sync bypasses shared replacement and applies only reviewed settings mapping after revision verification',()=>{
 const program=String.raw`
import importlib.util, json, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('sync','scripts/pi-sync.py')
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
with tempfile.TemporaryDirectory() as tmp:
 agent=Path(tmp); original={'packages':[{'source':sync.SOURCE,'extensions':['!packages/pi-tools/**'],'skills':[]}],'defaultModel':'personal'}
 (agent/'settings.json').write_text(json.dumps(original));(agent/'presets.json').write_text('PERSONAL PRESETS');(agent/'auth.json').write_text('CREDENTIALS')
 args=SimpleNamespace(agent_dir=tmp,pi_bin_dir='',revision='verified',apply=False,accept_config=False,require_approval=False,toolkit_only=True)
 with patch.object(sync.shutil,'which',return_value='/bin/pi'),patch.object(sync,'run') as run,patch.object(sync.subprocess,'check_output',return_value='verified\n'),patch.object(sync,'changes',side_effect=AssertionError('broad config sync')),patch.object(sync,'write_changes',side_effect=AssertionError('broad write')):
  sync.target(args,Path.cwd());run.assert_not_called();assert json.loads((agent/'settings.json').read_text())==original
  args.apply=True;sync.target(args,Path.cwd());assert run.call_count==1
 assert (agent/'presets.json').read_text()=='PERSONAL PRESETS';assert (agent/'auth.json').read_text()=='CREDENTIALS'
 migrated=json.loads((agent/'settings.json').read_text());assert migrated['defaultModel']=='personal';assert migrated['packages'][0]['skills']==[];assert migrated['packages'][0]['extensions']==['!packages/pi-toolkit/src/features/tools/**']
`;
 const result=spawnSync('python3',['-c',program],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stderr);
});
