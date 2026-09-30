import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Type } from 'typebox';
import { createAgentSession, createCodemodeExtension, createToolSearchExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import policy from './mcp-policy.ts';

// Real codemode/runner pipeline; no provider request and no external server mutation.
test('native codemode cannot bypass preset permissions through deferred tools', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-native-policy-'));
  mkdirSync(join(cwd, '.pi'));
  writeFileSync(join(cwd, '.pi/mcp-policy.json'), JSON.stringify({ presets: { research: 'read', ops: 'write' } }));
  let reads = 0;
  let writes = 0;
  const manager = SessionManager.inMemory(cwd);
  const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, noSkills: true, noPromptTemplates: true, noThemes: true, extensionFactories: [createCodemodeExtension(), createToolSearchExtension(), policy, pi => {
    for (const [name, readOnly] of [['mcp__test__read', true], ['mcp__test__write', false]]) pi.registerTool({
      name, label: name, description: name, parameters: Type.Object({}), exposure: 'deferred', annotations: { readOnlyHint: readOnly },
      execute: async () => { if (readOnly) reads++; else writes++; return { content: [{ type: 'text', text: 'ok' }], details: undefined }; }
    });
  }] });
  await loader.reload();
  const runtime = await ModelRuntime.create({ authPath: join(cwd, 'auth.json'), modelsPath: null, modelsStorePath: join(cwd, 'models-store.json'), refreshOnCreate: false });
  const { session } = await createAgentSession({ cwd, agentDir: cwd, resourceLoader: loader, modelRuntime: runtime, model: runtime.getModel('openai', 'gpt-6.1-sol'), sessionManager: manager, settingsManager: SettingsManager.inMemory({ defaultTools: ['codemode', 'tool_search'] }) });
  try {
    await session.bindExtensions({});
    manager.appendMessage({ role: 'assistant', api: 'openai-responses', provider: 'openai', model: 'gpt-6.1-sol', content: [{ type: 'toolCall', id: 'test-script', name: 'codemode', arguments: {} }], stopReason: 'toolUse', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: Date.now() });
    session.refreshContext();
    const codemode = session.agent.state.tools.find(tool => tool.name === 'codemode');
    assert.ok(codemode);
    const search = session.agent.state.tools.find(tool => tool.name === 'tool_search');
    assert.ok(search);
    await search.execute('test-search', { query: 'mcp test read', limit: 1 }, new AbortController().signal);
    assert.ok(session.getActiveToolNames().includes('mcp__test__read'));
    const run = code => codemode.execute('test-script', { code }, new AbortController().signal);
    manager.appendCustomEntry('preset-state', { name: 'plan' });
    const denied = await run('text(await tools.mcp__test__read({}));');
    assert.match(JSON.stringify(denied), /does not allow MCP/);
    assert.equal(reads, 0);
    manager.appendCustomEntry('preset-state', { name: 'research' });
    await run('text(await Promise.all([tools.mcp__test__read({}), tools.mcp__test__read({})]));');
    assert.equal(reads, 2);
    const writeDenied = await run('text(await tools.mcp__test__write({}));');
    assert.match(JSON.stringify(writeDenied), /read-only MCP/);
    assert.equal(writes, 0);
    manager.appendCustomEntry('preset-state', { name: 'ops' });
    const headless = await run('text(await tools.mcp__test__write({}));');
    assert.match(JSON.stringify(headless), /interactive confirmation/);
    assert.equal(writes, 0);
  } finally {
    session.dispose();
    rmSync(cwd, { recursive: true, force: true });
  }
});
