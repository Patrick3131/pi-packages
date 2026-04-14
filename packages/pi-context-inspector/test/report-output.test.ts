import test from 'node:test';
import assert from 'node:assert/strict';

import { renderReportHtml } from '../src/report-html.js';
import { renderReportJson } from '../src/report-json.js';
import { buildToolDefinitionsSummary } from '../src/parser.js';
import type { ContextInspectionReport } from '../src/types.js';

const report: ContextInspectionReport = {
  meta: {
    generatedAt: '2026-04-14T00:00:00.000Z',
    reportId: 'test-report',
    cwd: '/repo',
    agentDir: '/Users/test/.pi/agent',
    modelId: 'test-model',
    contextWindow: 200000,
    usedContextTokens: 1234,
    remainingContextTokens: 198766,
  },
  prompt: {
    effective: 'Prompt text',
    totalChars: 11,
    totalTokens: 3,
    sections: [],
  },
  files: {
    system: [],
    appendSystem: [],
    agents: [],
  },
  tools: {
    count: 1,
    totalChars: 10,
    totalTokens: 2,
    items: [{
      name: 'read',
      description: 'Read files',
      parameters: {},
      serialized: '{}',
      chars: 2,
      tokens: 1,
    }],
  },
  skills: {
    count: 0,
    totalTokens: 0,
    items: [],
  },
  diagnostics: [],
};

test('buildToolDefinitionsSummary serializes tool definitions', () => {
  const summary = buildToolDefinitionsSummary([{ name: 'read', description: 'Read files', parameters: { type: 'object' } }]);
  assert.equal(summary.count, 1);
  assert.match(summary.items[0]?.serialized ?? '', /"name": "read"/);
});

test('renderReportHtml contains major sections', () => {
  const html = renderReportHtml(report);
  assert.match(html, /Pi Context Inspector/);
  assert.match(html, /Effective system prompt/);
  assert.match(html, /Raw JSON/);
});

test('renderReportJson emits JSON string', () => {
  const json = renderReportJson(report);
  assert.match(json, /"reportId": "test-report"/);
});
