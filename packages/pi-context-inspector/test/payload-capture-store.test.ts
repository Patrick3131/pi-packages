import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  captureProviderPayloadSnapshot,
  getLatestPayloadCapture,
  loadRawPayload,
  recordModelSelection,
  resetPayloadCaptureState,
  restorePayloadCaptureState,
} from '../src/payload-capture-store.js';

test('payload capture store captures, persists, restores, and reloads raw payloads', () => {
  resetPayloadCaptureState();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-context-inspector-store-'));
  const appended: Array<{ type: string; data: unknown }> = [];
  const pi = {
    appendEntry: (type: string, data: unknown) => appended.push({ type, data }),
  } as any;
  const ctx = {
    cwd,
    model: { id: 'gpt-5' },
    getContextUsage: () => ({ tokens: 321, contextWindow: 1000, percent: 32.1 }),
    sessionManager: {
      getSessionId: () => 'session-1',
      getSessionFile: () => path.join(cwd, '.pi', 'sessions', 'session.json'),
      getLeafId: () => 'leaf-1',
      getBranch: () => appended.map((entry) => ({ type: 'custom', customType: entry.type, data: entry.data })),
    },
  } as any;

  const manifest = captureProviderPayloadSnapshot(pi, ctx, { messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(typeof manifest.rawPayloadPath, 'string');
  assert.equal(fs.existsSync(manifest.rawPayloadPath!), true);
  assert.equal(getLatestPayloadCapture()?.id, manifest.id);
  assert.deepEqual(loadRawPayload(manifest), { messages: [{ role: 'user', content: 'hello' }] });

  recordModelSelection(pi, { source: 'set', model: { id: 'gpt-5' }, previousModel: { id: 'gpt-4.1' } });
  resetPayloadCaptureState();
  const restored = restorePayloadCaptureState(ctx);
  assert.equal(restored.captures.length, 1);
  assert.equal(restored.modelSelections.length, 1);
});
