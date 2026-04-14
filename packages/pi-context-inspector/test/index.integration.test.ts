import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { generateContextReport } from '../src/index.js';

test('generateContextReport writes html and json reports', async () => {
  const notifications: Array<{ message: string; level?: string }> = [];
  const pi = {
    getAllTools: () => [],
  } as any;

  const ctx = {
    cwd: process.cwd(),
    getSystemPrompt: () => 'You are an expert coding assistant.\n\nGuidelines:\n- Be concise in your responses\n\nCurrent date: 2026-04-14\nCurrent working directory: /repo',
    getContextUsage: () => ({ tokens: 42, contextWindow: 1000, percent: 4.2 }),
    ui: {
      notify: (message: string, level?: string) => notifications.push({ message, level }),
    },
  } as any;

  const result = await generateContextReport(pi, ctx, () => ({ ok: true, command: 'test-open' }));
  assert.equal(typeof result.htmlPath, 'string');
  assert.equal(typeof result.jsonPath, 'string');
  assert.equal(fs.existsSync(result.htmlPath!), true);
  assert.equal(fs.existsSync(result.jsonPath!), true);
  assert.equal(notifications.length > 0, true);
});
