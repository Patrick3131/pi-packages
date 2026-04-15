import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeProviderPayload } from '../src/provider-normalization.js';

test('normalizeProviderPayload handles anthropic payloads', () => {
  const normalized = normalizeProviderPayload({
    model: 'claude-sonnet',
    system: 'You are helpful.',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Hello there' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
    ],
    tools: [{ name: 'read', description: 'Read files' }],
  });

  assert.equal(normalized.providerFamily, 'anthropic');
  assert.equal(normalized.system[0]?.text, 'You are helpful.');
  assert.equal(normalized.messages[0]?.text, 'Hello there');
  assert.equal(normalized.tools[0]?.name, 'read');
});

test('normalizeProviderPayload handles openai chat payloads', () => {
  const normalized = normalizeProviderPayload({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: [{ type: 'text', text: 'Explain this file' }] },
    ],
    tools: [{ type: 'function', function: { name: 'read', description: 'Read files' } }],
  });

  assert.equal(normalized.providerFamily, 'openai-chat');
  assert.equal(normalized.system[0]?.text, 'Be concise.');
  assert.equal(normalized.messages[0]?.role, 'user');
  assert.equal(normalized.messages[0]?.text, 'Explain this file');
});

test('normalizeProviderPayload handles openai responses payloads', () => {
  const normalized = normalizeProviderPayload({
    model: 'gpt-5',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'You are helpful.' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'Inspect the prompt.' }] },
    ],
    tools: [{ type: 'function', name: 'read', description: 'Read files' }],
  });

  assert.equal(normalized.providerFamily, 'openai-responses');
  assert.equal(normalized.system[0]?.text, 'You are helpful.');
  assert.equal(normalized.messages[0]?.text, 'Inspect the prompt.');
  assert.equal(normalized.tools[0]?.name, 'read');
});

test('normalizeProviderPayload maps openai responses top-level instructions into normalized system blocks', () => {
  const normalized = normalizeProviderPayload({
    model: 'gpt-5',
    instructions: 'Follow repo rules.',
    input: [
      { role: 'user', content: [{ type: 'input_text', text: 'Inspect the prompt.' }] },
    ],
    tools: [{ type: 'function', name: 'read', description: 'Read files' }],
    temperature: 0,
  });

  assert.equal(normalized.providerFamily, 'openai-responses');
  assert.equal(normalized.system[0]?.label, 'instructions (top-level)');
  assert.equal(normalized.system[0]?.text, 'Follow repo rules.');
  assert.equal(normalized.otherFields.some((field) => field.label === 'instructions'), false);
  assert.equal(normalized.otherFields.some((field) => field.label === 'temperature'), true);
});

test('normalizeProviderPayload handles openai responses string input without dropping user text', () => {
  const normalized = normalizeProviderPayload({
    model: 'gpt-5',
    instructions: 'Follow repo rules.',
    input: 'Inspect the prompt.',
  });

  assert.equal(normalized.providerFamily, 'openai-responses');
  assert.equal(normalized.messages[0]?.role, 'user');
  assert.equal(normalized.messages[0]?.text, 'Inspect the prompt.');
  assert.equal(normalized.otherFields.some((field) => field.label === 'input'), false);
});

test('normalizeProviderPayload handles gemini payloads', () => {
  const normalized = normalizeProviderPayload({
    model: 'gemini-2.5-pro',
    system_instruction: { parts: [{ text: 'You are a coding assistant.' }] },
    contents: [
      { role: 'user', parts: [{ text: 'Show me the context.' }] },
      { role: 'model', parts: [{ text: 'Here it is.' }] },
    ],
    tools: [{ functionDeclarations: [{ name: 'read', description: 'Read files' }] }],
  });

  assert.equal(normalized.providerFamily, 'gemini');
  assert.equal(normalized.system[0]?.text, 'You are a coding assistant.');
  assert.equal(normalized.messages[1]?.role, 'assistant');
  assert.equal(normalized.tools[0]?.name, 'read');
});

test('normalizeProviderPayload skips empty unknown messages', () => {
  const normalized = normalizeProviderPayload({
    model: 'gpt-5',
    input: [
      { foo: 'bar' },
      { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
    ],
  });

  assert.equal(normalized.providerFamily, 'openai-responses');
  assert.equal(normalized.messages.length, 1);
  assert.equal(normalized.messages[0]?.role, 'user');
  assert.equal(normalized.messages[0]?.text, 'hello');
});

test('normalizeProviderPayload falls back for unknown payloads', () => {
  const normalized = normalizeProviderPayload({ foo: 'bar' });
  assert.equal(normalized.providerFamily, 'unknown');
  assert.equal(normalized.caveats.includes('unknown-provider-shape'), true);
});
