import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { discoverPromptPaths } from '../src/path-discovery.js';

test('discoverPromptPaths finds ancestor AGENTS files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-context-inspector-'));
  const nested = path.join(root, 'a', 'b');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'root');
  fs.writeFileSync(path.join(root, 'a', 'AGENTS.md'), 'a');

  const discovered = discoverPromptPaths(nested);
  assert.equal(discovered.discoveredAgentsPaths.includes(path.join(root, 'AGENTS.md')), true);
  assert.equal(discovered.discoveredAgentsPaths.includes(path.join(root, 'a', 'AGENTS.md')), true);
});
