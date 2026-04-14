import test from 'node:test';
import assert from 'node:assert/strict';

import { attributeBasePrompt } from '../src/base-trace/attribution.js';

const tokenize = (text: string) => text.length;

test('attributeBasePrompt assigns extension-contributed tool lines', () => {
  const result = attributeBasePrompt(
    ['- crawl: Crawl the web'],
    ['- Be concise in your responses'],
    [
      {
        toolName: 'crawl',
        snippet: 'Crawl the web',
        guidelines: [],
        extensionPath: '/ext/crawl.ts',
      },
    ],
    100,
    tokenize
  );

  assert.equal(result.buckets.some((bucket) => bucket.id === '/ext/crawl.ts'), true);
  assert.equal(result.evidence.some((entry) => entry.bucket === 'extension'), true);
});
