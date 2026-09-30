import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  return { agent, run: (args = []) => spawnSync('bash', [restore, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir, PI_CODING_AGENT_DIR: agent, PATH: `${bin}:${process.env.PATH}`, TEST_PI_VERSION: version, TEST_PI_CALLS: join(dir, 'calls') } }), calls: () => existsSync(join(dir, 'calls')) ? readFileSync(join(dir, 'calls'), 'utf8') : '' };
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
  const sharedPackage = settings.packages.find(p => p.source?.endsWith('/pi-packages'));
  assert.ok(sharedPackage.extensions.includes('!packages/pi-keepalive/**'));
  assert.equal(sharedPackage.skills, undefined);
  assert.equal(readFileSync(join(f.agent, 'mcp-auth.json'), 'utf8'), 'private-existing-auth');
  assert.equal(existsSync(join(f.agent, 'mcp-adapter.json')), false);
  assert.equal(existsSync(join(f.agent, 'extensions/minimal-mode.ts')), false);
  assert.equal(existsSync(join(f.agent, 'extensions/mcp-policy.ts')), true);
  assert.doesNotMatch(f.calls(), /install (?:npm:pi-mcp-adapter|git:github.com\/StanleyOneG\/pi-compact)/);
  assert.match(f.calls(), /remove npm:pi-mcp-adapter/);
});

test('restore removes only the obsolete shared-work filter and is stable on repeat', t => {
  for (const [skills, expectedSkills] of [
    [['!packages/pi-work/skills/**'], undefined],
    [['!packages/pi-work/skills/**', '!private/**', '+skills/explicit', '!packages/pi-work/skills/*'], ['!private/**', '+skills/explicit', '!packages/pi-work/skills/*']],
    [[], []],
  ]) {
    const f = fixture(t);
    const source = 'git:github.com/Patrick3131/pi-packages';
    const personal = { source: 'npm:personal-extension', skills: ['!packages/pi-work/skills/**'], extensions: [] };
    const original = { defaultProvider: 'personal', customSetting: { retained: true }, packages: [
      { source, skills, extensions: ['!private-extension/**', '!packages/pi-keepalive/**'], prompts: [], customOption: true },
      personal,
    ] };
    writeFileSync(join(f.agent, 'settings.json'), JSON.stringify(original));
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const first = readFileSync(join(f.agent, 'settings.json'), 'utf8');
    const settings = JSON.parse(first);
    assert.equal(settings.defaultProvider, original.defaultProvider);
    assert.deepEqual(settings.customSetting, original.customSetting);
    assert.deepEqual(settings.packages.find(p => p.source === source), {
      source, ...(expectedSkills === undefined ? {} : { skills: expectedSkills }),
      extensions: original.packages[0].extensions, prompts: [], customOption: true,
    });
    assert.deepEqual(settings.packages.find(p => p.source === personal.source), personal);
    assert.equal(settings.packages.filter(p => (typeof p === 'string' ? p : p.source) === source).length, 1);
    const repeated = f.run();
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(readFileSync(join(f.agent, 'settings.json'), 'utf8'), first);
  }
});

test('fresh restore enables canonical skills once and remains stable', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const first = readFileSync(join(f.agent, 'settings.json'), 'utf8');
  const packages = JSON.parse(first).packages;
  const shared = packages.filter(p => p.source === 'git:github.com/Patrick3131/pi-packages');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].skills, undefined);
  assert.deepEqual(shared[0].extensions, ['!packages/pi-keepalive/**']);
  assert.equal(f.run().status, 0);
  assert.equal(readFileSync(join(f.agent, 'settings.json'), 'utf8'), first);
});

test('migration-only mode backs up settings and leaves personal configuration and installs untouched', t => {
  const f = fixture(t, '0.87.1'); // Migration needs Python, not a Pi version check.
  const source = 'git:github.com/Patrick3131/pi-packages';
  const original = { defaultProvider: 'personal', packages: [
    { source, skills: ['!private/**', '!packages/pi-work/skills/**'], extensions: ['!personal/**'] },
    { source, skills: ['!packages/pi-work/skills/**'] },
    { source, skills: [] },
    { source: 'npm:personal-extension', skills: ['!packages/pi-work/skills/**'] },
    'npm:pi-mcp-adapter',
  ], subagents: { personal: true } };
  const originalText = JSON.stringify(original);
  writeFileSync(join(f.agent, 'settings.json'), originalText);
  mkdirSync(join(f.agent, 'extensions/subagent'));
  writeFileSync(join(f.agent, 'extensions/subagent/config.json'), 'personal-subagent-config');
  writeFileSync(join(f.agent, 'presets.json'), 'personal-presets');
  const result = f.run(['--migrate-work-skills']);
  assert.equal(result.status, 0, result.stderr);
  const first = readFileSync(join(f.agent, 'settings.json'), 'utf8');
  assert.deepEqual(JSON.parse(first), { ...original, packages: [
    { ...original.packages[0], skills: ['!private/**'] },
    { source },
    ...original.packages.slice(2),
  ] });
  const backups = readdirSync(f.agent).filter(name => name.startsWith('settings.json.bak.'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(f.agent, backups[0]), 'utf8'), originalText);
  assert.equal(readFileSync(join(f.agent, 'extensions/subagent/config.json'), 'utf8'), 'personal-subagent-config');
  assert.equal(readFileSync(join(f.agent, 'presets.json'), 'utf8'), 'personal-presets');
  assert.equal(existsSync(join(f.agent, 'extensions/mcp-policy.ts')), false);
  assert.equal(f.calls(), '');
  assert.equal(f.run(['--migrate-work-skills']).status, 0);
  assert.equal(readFileSync(join(f.agent, 'settings.json'), 'utf8'), first);
  assert.deepEqual(readdirSync(f.agent).filter(name => name.startsWith('settings.json.bak.')), backups);
  const fresh = fixture(t);
  assert.equal(fresh.run(['--migrate-work-skills']).status, 0);
  assert.equal(existsSync(join(fresh.agent, 'settings.json')), false);
  assert.equal(fresh.calls(), '');
  for (const args of [['--migrate-work-skills', '--force'], ['--force', '--migrate-work-skills']]) {
    assert.notEqual(f.run(args).status, 0);
    assert.equal(readFileSync(join(f.agent, 'settings.json'), 'utf8'), first);
  }
  const malformed = fixture(t);
  writeFileSync(join(malformed.agent, 'settings.json'), '{invalid');
  assert.notEqual(malformed.run(['--migrate-work-skills']).status, 0);
  assert.equal(readFileSync(join(malformed.agent, 'settings.json'), 'utf8'), '{invalid');
  assert.equal(readdirSync(malformed.agent).some(name => name.startsWith('settings.json.bak.')), false);
  assert.equal(malformed.calls(), '');
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
