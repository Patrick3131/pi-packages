import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSystemPrompt } from '../src/parser.js';

const prompt = `You are an expert coding assistant.

Available tools:
- read: read files

Guidelines:
- Be concise in your responses
- Show file paths clearly when working with files

Pi documentation (read only when the user asks about pi itself)
- Always read pi .md files completely and follow links.

Extra appended instruction.

# Project Context

Project-specific instructions and guidelines:

## /repo/AGENTS.md

# AGENTS
Be careful.

## Purpose

Explain the repo.

## Scope

Cover all packages.

The following skills provide specialized instructions.
<available_skills>
  <skill>
    <name>brief</name>
    <description>Be brief</description>
    <location>/skills/brief/SKILL.md</location>
  </skill>
</available_skills>
Current date: 2026-04-14
Current working directory: /repo`;

test('parseSystemPrompt supports current Pi footer markers', () => {
  const parsed = parseSystemPrompt(prompt);
  assert.equal(parsed.sections.some((section) => section.kind === 'metadata'), true);
  assert.equal(parsed.sections.some((section) => section.kind === 'agents'), true);
  assert.equal(parsed.sections.some((section) => section.kind === 'skills'), true);
  assert.equal(parsed.sections.some((section) => section.kind === 'system-append'), true);
});


test('parseSystemPrompt only treats project-context file headings as AGENTS file roots while still splitting file subsections', () => {
  const parsed = parseSystemPrompt(prompt);
  const agents = parsed.sections.find((section) => section.kind === 'agents');
  assert.ok(agents);
  assert.equal(agents.children?.[0]?.label, '/repo/AGENTS.md');
  assert.equal(agents.children?.some((child) => child.label === 'Purpose'), true);
  assert.equal(agents.children?.some((child) => child.label === 'Scope'), true);
});

test('parseSystemPrompt supports older date and time footer marker', () => {
  const older = prompt.replace('Current date: 2026-04-14\nCurrent working directory: /repo', 'Current date and time: 2026-04-14T12:00:00Z');
  const parsed = parseSystemPrompt(older);
  const metadata = parsed.sections.find((section) => section.kind === 'metadata');
  assert.ok(metadata);
  assert.match(metadata.content ?? '', /Current date and time:/);
});
