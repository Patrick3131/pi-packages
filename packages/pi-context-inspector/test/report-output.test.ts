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
  payload: {
    available: true,
    visibility: 'exact-payload',
    source: 'before_provider_request',
    latestCapture: {
      version: 1,
      id: 'capture-1',
      capturedAt: '2026-04-14T00:00:01.000Z',
      source: 'before_provider_request',
      cwd: '/repo',
      sessionId: 'session-1',
      sessionFile: '/repo/.pi/sessions/session.json',
      leafId: 'leaf-1',
      providerFamily: 'openai-responses',
      modelId: 'gpt-5',
      rawPayloadPath: '/tmp/capture.json',
      rawPayloadPreview: '{"input":[]}',
      persisted: true,
      visibility: 'exact-payload',
      normalizationStatus: 'full',
      serializedPayloadChars: 200,
      serializedPayloadTokens: 50,
      contextUsageTokens: 1234,
      contextWindow: 200000,
      caveats: [],
    },
    rawPayload: { input: [] },
    normalization: {
      providerFamily: 'openai-responses',
      modelId: 'gpt-5',
      status: 'full',
      system: [{ label: 'instructions (top-level)', text: 'Be concise.', chars: 11, tokens: 3 }],
      messages: [{ index: 0, role: 'user', label: 'user #1', text: 'Inspect this.', chars: 13, tokens: 4 }],
      tools: [],
      otherFields: [],
      caveats: [],
    },
    analysis: {
      normalizedPayloadCharsEstimate: 24,
      normalizedPayloadTokensEstimate: 7,
      requestJsonCharsEstimate: 200,
      requestJsonTokensEstimate: 50,
      requestJsonMinusNormalizedCharsEstimate: 176,
      requestJsonMinusNormalizedTokensEstimate: 43,
      sections: {
        system: { label: 'Normalized system / developer instructions', count: 1, chars: 11, tokens: 3 },
        messages: { label: 'Normalized conversation messages', count: 1, chars: 13, tokens: 4 },
        tools: { label: 'Normalized tools', count: 0, chars: 0, tokens: 0 },
        otherFields: { label: 'Unclassified request JSON fields', count: 0, chars: 0, tokens: 0 },
      },
      comparison: {
        normalizedPayloadTokensEstimate: 7,
        requestJsonTokensEstimate: 50,
        requestJsonMinusNormalizedTokensEstimate: 43,
        runtimeContextUsageTokens: 1234,
        captureTimeContextUsageTokens: 1234,
        runtimeMinusRequestJsonTokensEstimate: 1184,
      },
    },
    currentContextSummary: {
      bestAvailableView: 'captured-payload',
      effectiveSystemPromptTokens: 3,
      effectiveSystemPromptChars: 11,
      normalizedPayloadSystemTokens: 3,
      normalizedPayloadSystemChars: 11,
      normalizedPayloadMessageCount: 1,
      normalizedPayloadMessageTokens: 4,
      normalizedPayloadToolCount: 0,
      normalizedPayloadToolTokens: 0,
      normalizedPayloadTokensEstimate: 7,
      requestJsonTokensEstimate: 50,
      runtimeContextUsageTokens: 1234,
      contextWindow: 200000,
      visibility: 'exact-payload',
      normalizationStatus: 'full',
      summaryLines: [
        'Effective system prompt visible from ctx.getSystemPrompt(): ~3 tokens.',
        'Latest normalized provider payload captured 1 system/developer instruction block(s), 1 conversation message(s), and 0 tool definition block(s).',
      ],
    },
    history: [],
    modelHistory: [],
  },
  diagnostics: [],
};

test('buildToolDefinitionsSummary serializes tool definitions', () => {
  const summary = buildToolDefinitionsSummary([{ name: 'read', description: 'Read files', parameters: { type: 'object' } }]);
  assert.equal(summary.count, 1);
  assert.match(summary.items[0]?.serialized ?? '', /"name": "read"/);
});

test('renderReportHtml contains major sections and explainers', () => {
  const html = renderReportHtml({
    ...report,
    prompt: {
      ...report.prompt,
      effective: 'Line one\n\nLine two',
    },
  });
  assert.match(html, /Pi Context Inspector/);
  assert.match(html, /What is in context right now\?/);
  assert.match(html, /Glossary \/ quick help/);
  assert.match(html, /Normalized payload estimate/);
  assert.match(html, /Serialized request JSON estimate/);
  assert.match(html, /Request JSON minus normalized payload/);
  assert.match(html, /Runtime context usage/);
  assert.match(html, /What do these payload numbers mean\?/);
  assert.match(html, /Normalized payload vs request JSON/);
  assert.match(html, /Conversation messages/);
  assert.match(html, /Normalized system \/ developer instructions/);
  assert.match(html, /Effective system prompt/);
  assert.match(html, /Detailed tool definitions/);
  assert.match(html, /Tree view/);
  assert.match(html, /Formatted/);
  assert.match(html, /Raw JSON tree\/object size here is report\/export size/);
  assert.doesNotMatch(html, /<td>Normalized tools<\/td>/);
  assert.doesNotMatch(html, /<td>Unclassified request JSON fields<\/td>/);
});

test('renderReportJson emits JSON string', () => {
  const json = renderReportJson(report);
  assert.match(json, /"reportId": "test-report"/);
  assert.match(json, /"currentContextSummary"/);
  assert.match(json, /"normalizedPayloadTokensEstimate": 7/);
});
