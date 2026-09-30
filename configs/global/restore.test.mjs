import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const restore = fileURLToPath(new URL('./restore.sh', import.meta.url));
function fixture(t, version = '0.99.1') {
  const dir = mkdtempSync(join(tmpdir(), 'pi-restore-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const agent = join(dir, 'agent');
  const bin = join(dir, 'bin');
  mkdirSync(join(agent, 'extensions'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(bin, 'pi'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "$TEST_PI_VERSION"; else printf "%s\\n" "$*" >> "$TEST_PI_CALLS"; fi\n', { mode: 0o755 });
  return { agent, run: () => spawnSync('bash', [restore], { encoding: 'utf8', env: { ...process.env, HOME: dir, PI_CODING_AGENT_DIR: agent, PATH: `${bin}:${process.env.PATH}`, TEST_PI_VERSION: version, TEST_PI_CALLS: join(dir, 'calls') } }), calls: () => readFileSync(join(dir, 'calls'), 'utf8') };
}

test('restore removes obsolete layers without overwriting credentials or re-installing retired packages', t => {
  const f = fixture(t);
  writeFileSync(join(f.agent, 'settings.json'), JSON.stringify({ defaultProvider: 'personal', packages: ['npm:pi-mcp-adapter', 'git:github.com/StanleyOneG/pi-compact', 'git:github.com/Patrick3131/pi-packages', 'npm:personal-extension'] }));
  writeFileSync(join(f.agent, 'mcp-auth.json'), 'private-existing-auth');
  writeFileSync(join(f.agent, 'extensions/minimal-mode.ts'), 'retired');
  writeFileSync(join(f.agent, 'mcp-adapter.json'), '{}');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(readFileSync(join(f.agent, 'settings.json'), 'utf8'));
  const sources = settings.packages.map(p => typeof p === 'string' ? p : p.source);
  assert.equal(settings.defaultProvider, 'personal');
  assert.ok(sources.includes('npm:personal-extension'));
  assert.ok(!sources.includes('npm:pi-mcp-adapter'));
  assert.ok(!sources.includes('git:github.com/StanleyOneG/pi-compact'));
  assert.ok(settings.packages.find(p => p.source?.endsWith('/pi-packages')).extensions.includes('!packages/pi-keepalive/**'));
  assert.equal(readFileSync(join(f.agent, 'mcp-auth.json'), 'utf8'), 'private-existing-auth');
  assert.equal(existsSync(join(f.agent, 'mcp-adapter.json')), false);
  assert.equal(existsSync(join(f.agent, 'extensions/minimal-mode.ts')), false);
  assert.equal(existsSync(join(f.agent, 'extensions/mcp-policy.ts')), true);
  assert.doesNotMatch(f.calls(), /install (?:npm:pi-mcp-adapter|git:github.com\/StanleyOneG\/pi-compact)/);
  assert.match(f.calls(), /remove npm:pi-mcp-adapter/);
});

test('restore refuses a pre-native-MCP runtime before altering its configuration', t => {
  const f = fixture(t, '0.87.1');
  writeFileSync(join(f.agent, 'mcp-adapter.json'), 'retained');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Run pi update first/);
  assert.equal(readFileSync(join(f.agent, 'mcp-adapter.json'), 'utf8'), 'retained');
  assert.equal(existsSync(join(f.agent, 'settings.json')), false);
});
