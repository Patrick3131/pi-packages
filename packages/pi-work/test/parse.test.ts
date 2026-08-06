import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyBasename,
  extractDateFromBaseName,
  extractTitle,
  extractType,
  inferTypeFromBaseName,
  parseFrontmatter,
  parseMarkdown,
} from "../src/parse.js";

test("parseFrontmatter reads simple key values", () => {
  const raw = `---
status: in_progress
owner: engineering
last_reviewed: 2026-04-15
canonical_ref: none
---

# Title

Body
`;
  const { frontmatter, body } = parseFrontmatter(raw);
  assert.equal(frontmatter.status, "in_progress");
  assert.equal(frontmatter.owner, "engineering");
  assert.match(body, /# Title/);
});

test("parseFrontmatter returns body when no frontmatter", () => {
  const { frontmatter, body } = parseFrontmatter("# Just a title\n");
  assert.deepEqual(frontmatter, {});
  assert.equal(body, "# Just a title\n");
});

test("extractTitle and extractType", () => {
  const body = `# My Feature

## Type

feature

## Problem

Something
`;
  assert.equal(extractTitle(body), "My Feature");
  assert.equal(extractType(body), "feature");
});

test("classifyBasename detects companions", () => {
  assert.deepEqual(classifyBasename("2026-04-15-feature-foo"), {
    baseName: "2026-04-15-feature-foo",
    kind: "primary",
  });
  assert.deepEqual(classifyBasename("2026-04-15-feature-foo-to-do-list"), {
    baseName: "2026-04-15-feature-foo",
    kind: "todo",
  });
  assert.deepEqual(classifyBasename("2026-04-15-feature-foo-test"), {
    baseName: "2026-04-15-feature-foo",
    kind: "test",
  });
});

test("date and type inference from basename", () => {
  assert.equal(extractDateFromBaseName("2026-04-15-feature-foo"), "2026-04-15");
  assert.equal(inferTypeFromBaseName("2026-04-15-feature-foo"), "feature");
  assert.equal(inferTypeFromBaseName("2026-04-15-technical-bar"), "technical");
});

test("parseMarkdown combines fields", () => {
  const parsed = parseMarkdown(`---
status: backlog
---

# Hello

## Type

bug

## Problem

Broken thing
`);
  assert.equal(parsed.title, "Hello");
  assert.equal(parsed.type, "bug");
  assert.equal(parsed.frontmatter.status, "backlog");
  assert.match(parsed.preview, /Broken thing|Problem/);
});
