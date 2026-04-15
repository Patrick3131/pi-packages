import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeAgentsCoverage } from '../src/agents-coverage.js';
import type { SourceFileRecord } from '../src/types.js';

function agentFile(path: string, content: string, readable = true): SourceFileRecord {
  return {
    path,
    scope: 'project',
    role: 'agents',
    exists: true,
    readable,
    content: readable ? content : undefined,
    chars: readable ? content.length : undefined,
    tokens: readable ? 1 : undefined,
  };
}

test('classifies exact prompt block match as full', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS\n\n## Purpose\nBe careful.')],
    promptBlocks: [{
      path: '/repo/AGENTS.md',
      rawBlock: '## /repo/AGENTS.md\n\n# AGENTS\n\n## Purpose\nBe careful.',
      bodyText: '# AGENTS\n\n## Purpose\nBe careful.',
      chars: 33,
      tokens: 10,
    }],
    payloadSystemBlocks: [],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'full');
  assert.equal(result.items[0]?.presentInVisiblePrompt, true);
  assert.equal(result.items[0]?.coveragePercent, 100);
});

test('classifies shortened prompt block as partial', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS\n\n## Purpose\nBe careful.\n\n## Scope\nEverything.')],
    promptBlocks: [{
      path: '/repo/AGENTS.md',
      rawBlock: '## /repo/AGENTS.md\n\n# AGENTS\n\n## Purpose\nBe careful.',
      bodyText: '# AGENTS\n\n## Purpose\nBe careful.',
      chars: 33,
      tokens: 10,
    }],
    payloadSystemBlocks: [],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'partial');
  assert.match(result.items[0]?.missingFromPromptExcerpt ?? '', /Scope/);
});

test('classifies payload-only normalized match as transformed', () => {
  const content = '# AGENTS\n\n## Purpose\nBe careful.';
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', content)],
    promptBlocks: [],
    payloadSystemBlocks: [{ label: 'instructions', text: content }],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'transformed');
  assert.equal(result.items[0]?.presentInVisiblePrompt, false);
  assert.equal(result.items[0]?.seenInCapturedPayload, true);
});

test('classifies missing evidence as not-present when payload visibility is sufficient', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS\n\n## Purpose\nBe careful.')],
    promptBlocks: [],
    payloadSystemBlocks: [{ label: 'instructions', text: 'Unrelated instruction.' }],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'not-present');
});

test('classifies unreadable file as unable-to-determine', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS', false)],
    promptBlocks: [],
    payloadSystemBlocks: [],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'unable-to-determine');
});

test('preserves prompt presence when the on-disk file is unreadable', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS', false)],
    promptBlocks: [{
      path: '/repo/AGENTS.md',
      rawBlock: '## /repo/AGENTS.md\n\n# AGENTS\n\n## Purpose\nVisible.',
      bodyText: '# AGENTS\n\n## Purpose\nVisible.',
      chars: 31,
      tokens: 8,
    }],
    payloadSystemBlocks: [],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'unable-to-determine');
  assert.equal(result.items[0]?.presentInVisiblePrompt, true);
  assert.match(result.items[0]?.reason ?? '', /visible AGENTS block/);
});

test('downgrades ambiguous payload-only duplicate-content match to unable-to-determine', () => {
  const shared = '# AGENTS\n\n## Purpose\nShared text.';
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', shared), agentFile('/repo/packages/a/AGENTS.md', shared)],
    promptBlocks: [],
    payloadSystemBlocks: [{ label: 'instructions', text: shared }],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'full',
  });

  assert.equal(result.items[0]?.status, 'unable-to-determine');
  assert.equal(result.items[1]?.status, 'unable-to-determine');
});

test('uses unable-to-determine instead of not-present when payload visibility is partial', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS\n\n## Purpose\nBe careful.')],
    promptBlocks: [],
    payloadSystemBlocks: [],
    payloadVisibility: 'partial-payload',
    payloadNormalizationStatus: 'partial',
  });

  assert.equal(result.items[0]?.status, 'unable-to-determine');
});

test('uses unable-to-determine instead of not-present when no payload was captured yet', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS\n\n## Purpose\nBe careful.')],
    promptBlocks: [],
    payloadSystemBlocks: [],
    payloadVisibility: 'prompt-only-fallback',
    payloadNormalizationStatus: 'unknown',
  });

  assert.equal(result.items[0]?.status, 'unable-to-determine');
});

test('uses unable-to-determine instead of not-present when payload normalization is partial', () => {
  const result = analyzeAgentsCoverage({
    diskFiles: [agentFile('/repo/AGENTS.md', '# AGENTS\n\n## Purpose\nBe careful.')],
    promptBlocks: [],
    payloadSystemBlocks: [],
    payloadVisibility: 'exact-payload',
    payloadNormalizationStatus: 'partial',
  });

  assert.equal(result.items[0]?.status, 'unable-to-determine');
});
