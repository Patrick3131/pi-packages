import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import extension, { activePreset, parseMcpPolicy } from './mcp-policy.ts';

function harness(t, { preset = 'ops', readOnly = false, hasUI = false, approve = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-mcp-policy-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.pi'));
  writeFileSync(join(cwd, '.pi/mcp-policy.json'), JSON.stringify({ presets: { ops: 'write', research: 'read' } }));
  const handlers = new Map();
  const name = 'mcp__engagement__engagement_save';
  let confirmations = 0;
  extension({ on: (name, handler) => handlers.set(name, handler), getAllTools: () => [{ name, annotations: { readOnlyHint: readOnly } }] });
  const ctx = { cwd, hasUI, sessionManager: { getBranch: () => [{ type: 'custom', customType: 'preset-state', data: { name: preset } }] }, ui: { confirm: async () => { confirmations++; return approve; } } };
  return { cwd, ctx, confirmations: () => confirmations, call: (toolName = name, extra = {}) => handlers.get('tool_call')({ toolName, input: {}, ...extra }, ctx) };
}

test('direct and nested MCP calls are denied outside opted-in presets', async t => {
  const h = harness(t, { preset: 'plan', readOnly: true });
  assert.equal((await h.call()).block, true);
  assert.equal((await h.call(undefined, { parentToolCallId: 'codemode-1' })).block, true);
  assert.equal((await h.call('read_mcp_resource')).block, true);
  assert.equal(await h.call('bash'), undefined);
});

test('read-only presets allow reads/resources but reject writes including nested calls', async t => {
  const h = harness(t, { preset: 'research', readOnly: true });
  assert.equal(await h.call(), undefined);
  assert.equal(await h.call('read_mcp_resource'), undefined);
  const writes = harness(t, { preset: 'research', hasUI: true, approve: true });
  assert.equal((await writes.call(undefined, { parentToolCallId: 'batch' })).block, true);
  assert.equal(writes.confirmations(), 0);
});

test('write calls require UI approval, including tools with missing annotations', async t => {
  const headless = harness(t);
  assert.equal((await headless.call()).block, true);
  const rejected = harness(t, { hasUI: true });
  assert.equal((await rejected.call()).block, true);
  const approved = harness(t, { hasUI: true, approve: true });
  assert.equal(await approved.call(undefined, { parentToolCallId: 'batch' }), undefined);
  assert.equal(approved.confirmations(), 1);
  assert.equal(await approved.call('mcp__unknown__write'), undefined);
  assert.equal(approved.confirmations(), 2);
});

test('missing or malformed policy fails closed and branch state clears access', async t => {
  const h = harness(t, { readOnly: true });
  writeFileSync(join(h.cwd, '.pi/mcp-policy.json'), '{');
  assert.equal((await h.call()).block, true);
  rmSync(join(h.cwd, '.pi/mcp-policy.json'));
  assert.equal((await h.call()).block, true);
  assert.equal(activePreset([{ type: 'custom', customType: 'preset-state', data: { name: 'ops' } }, { type: 'custom', customType: 'preset-state', data: { name: null } }]), undefined);
  assert.throws(() => parseMcpPolicy('{"presets":{"ops":"anything"}}'));
  assert.throws(() => parseMcpPolicy('{"presets":[]}'));
});
