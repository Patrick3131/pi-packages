#!/usr/bin/env python3
"""Fresh-process, no-model RPC smoke check for one installed Pi toolkit consumer."""
import argparse
import json
import os
from pathlib import Path
import select
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--agent-dir', default=os.environ.get('PI_CODING_AGENT_DIR', str(Path.home()/'.pi/agent')))
    parser.add_argument('--cwd')
    args = parser.parse_args()
    agent = Path(args.agent_dir).expanduser().resolve()
    env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent))
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(['pi', '--mode', 'rpc', '--no-session', '--offline'], cwd=args.cwd or agent,
                                   env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, bufsize=0)
        notifications = []
        def call(command):
            process.stdin.write((json.dumps(command)+'\n').encode()); process.stdin.flush()
            deadline = time.monotonic()+90
            while time.monotonic()<deadline:
                ready, _, _ = select.select([process.stdout], [], [], max(0, deadline-time.monotonic()))
                if not ready:
                    raise RuntimeError('RPC deadline elapsed')
                line = process.stdout.readline()
                if not line:
                    raise RuntimeError('Pi exited before response')
                record = json.loads(line)
                if record.get('type') in ('agent_start', 'message_start'):
                    raise RuntimeError('Unexpected model run in command smoke check')
                if record.get('type')=='extension_ui_request' and record.get('method')=='notify':
                    notifications.append(record.get('message',''))
                if record.get('type')=='response' and record.get('id')==command['id']:
                    if record.get('success') is not True:
                        raise RuntimeError('RPC command failed')
                    return record
            raise RuntimeError('RPC deadline elapsed')
        try:
            commands=call({'id':'commands','type':'get_commands'})['data']['commands']
            owned=[]
            for name in ['preset','tools','skill-mentions','overview']:
                matches=[c for c in commands if c['name']==name]
                if len(matches)!=1 or '/pi-toolkit/src/features/' not in matches[0].get('sourceInfo',{}).get('path',''):
                    raise RuntimeError('Missing, duplicate or non-toolkit command: '+name)
                owned.append({'name':name,'path':matches[0]['sourceInfo']['path']})
            for name,message in [('overview','/overview'),('preset','/preset implement'),('tools','/tools print read'),('mentions','/skill-mentions'),('overview-after','/overview')]:
                response=call({'id':name,'type':'prompt','message':message})
                if response.get('data',{}).get('disposition') not in ('handled',None):
                    raise RuntimeError('Command started a model run')
            reports=[note.removeprefix('My Pi: ') for note in notifications if note.startswith('My Pi: ')]
            if not reports or not Path(reports[-1]).is_file():
                raise RuntimeError('Overview report missing')
            if not any('Preset "implement" activated' in n for n in notifications):
                raise RuntimeError('Preset smoke failed')
            if not any('skill(s) available' in n for n in notifications):
                raise RuntimeError('Skill index smoke failed')
            print(json.dumps({'commands':owned,'report':reports[-1],'preset':'implement','model_calls':0,'status':'passed'},indent=2))
        finally:
            process.stdin.close()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate(); process.wait(timeout=5)

if __name__=='__main__':
    main()
