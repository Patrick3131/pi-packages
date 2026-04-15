import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeNormalizedPayload } from '../src/payload-analysis.js';
import { normalizeProviderPayload } from '../src/provider-normalization.js';

test('analyzeNormalizedPayload computes normalized payload, request JSON, and runtime comparison totals', () => {
  const rawPayload = {
    model: 'gpt-5',
    instructions: 'Follow repo rules.',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'You are helpful.' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'Inspect the prompt.' }] },
    ],
    tools: [{ type: 'function', name: 'read', description: 'Read files' }],
    temperature: 0,
  };

  const normalized = normalizeProviderPayload(rawPayload);
  const analysis = analyzeNormalizedPayload(normalized, rawPayload, {
    reportContextUsageTokens: 500,
    captureContextUsageTokens: 450,
  });

  assert.equal(analysis.normalizedPayloadTokensEstimate > 0, true);
  assert.equal(analysis.requestJsonTokensEstimate >= analysis.normalizedPayloadTokensEstimate, true);
  assert.equal(analysis.requestJsonMinusNormalizedTokensEstimate >= 0, true);
  assert.equal(analysis.sections.messages.count, 1);
  assert.equal(analysis.sections.system.count, 2);
  assert.equal(analysis.sections.otherFields.count, 1);
  assert.equal(analysis.comparison.runtimeContextUsageTokens, 500);
  assert.equal(analysis.comparison.captureTimeContextUsageTokens, 450);
  assert.equal(
    analysis.comparison.runtimeMinusRequestJsonTokensEstimate,
    500 - analysis.requestJsonTokensEstimate
  );
});
