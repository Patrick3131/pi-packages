import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBrowserOpenCommand } from '../src/open-browser.js';

test('resolveBrowserOpenCommand returns macOS open command', () => {
  const result = resolveBrowserOpenCommand('/tmp/report.html', 'darwin');
  assert.equal(result.command, 'open');
  assert.deepEqual(result.args, ['/tmp/report.html']);
});

test('resolveBrowserOpenCommand returns linux xdg-open command', () => {
  const result = resolveBrowserOpenCommand('/tmp/report.html', 'linux');
  assert.equal(result.command, 'xdg-open');
  assert.deepEqual(result.args, ['/tmp/report.html']);
});

test('resolveBrowserOpenCommand returns windows start command', () => {
  const result = resolveBrowserOpenCommand('C:/tmp/report.html', 'win32');
  assert.equal(result.command, 'cmd');
  assert.deepEqual(result.args, ['/c', 'start', '', 'C:/tmp/report.html']);
});
