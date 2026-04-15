import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { generateContextReport } from '../src/index.js';
import { captureProviderPayloadSnapshot, resetPayloadCaptureState } from '../src/payload-capture-store.js';

test('generateContextReport writes html and json reports', async () => {
  resetPayloadCaptureState();
  const notifications: Array<{ message: string; level?: string }> = [];
  const appended: Array<{ type: string; data: unknown }> = [];
  const pi = {
    getAllTools: () => [],
    appendEntry: (type: string, data: unknown) => appended.push({ type, data }),
  } as any;

  const ctx = {
    cwd: process.cwd(),
    model: { id: 'gpt-5' },
    getSystemPrompt: () => 'You are an expert coding assistant.\n\nGuidelines:\n- Be concise in your responses\n\nCurrent date: 2026-04-14\nCurrent working directory: /repo',
    getContextUsage: () => ({ tokens: 42, contextWindow: 1000, percent: 4.2 }),
    sessionManager: {
      getSessionId: () => 'session-1',
      getSessionFile: () => undefined,
      getLeafId: () => 'leaf-1',
      getBranch: () => appended.map((entry) => ({ type: 'custom', customType: entry.type, data: entry.data })),
    },
    ui: {
      notify: (message: string, level?: string) => notifications.push({ message, level }),
    },
  } as any;

  captureProviderPayloadSnapshot(pi, ctx, {
    model: 'gpt-5',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'Be concise.' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'Inspect this session.' }] },
    ],
  });

  const result = await generateContextReport(pi, ctx, () => ({ ok: true, command: 'test-open' }));
  assert.equal(typeof result.htmlPath, 'string');
  assert.equal(typeof result.jsonPath, 'string');
  assert.equal(fs.existsSync(result.htmlPath!), true);
  assert.equal(fs.existsSync(result.jsonPath!), true);
  assert.equal(notifications.length > 0, true);
  const json = fs.readFileSync(result.jsonPath!, 'utf8');
  assert.match(json, /"payload"/);
  assert.match(json, /"agentsCoverage"/);
});
