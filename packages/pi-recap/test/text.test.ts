import assert from "node:assert/strict";
import test from "node:test";

import { firstLine, truncateAtLine } from "../src/text.js";

test("truncateAtLine keeps short text whole", () => {
	const result = truncateAtLine("short answer", 100);
	assert.deepEqual(result, { head: "short answer", tail: "", truncated: false });
});

test("truncateAtLine cuts at the last line boundary and keeps the remainder", () => {
	const text = "line one\nline two\nline three";
	const result = truncateAtLine(text, 14);
	assert.equal(result.truncated, true);
	assert.equal(result.head, "line one");
	assert.equal(result.tail, "\nline two\nline three");
	assert.equal(result.head + result.tail, text);
});

test("truncateAtLine falls back to a word boundary when there is no newline", () => {
	const text = "alpha beta gamma delta";
	const result = truncateAtLine(text, 14);
	assert.equal(result.head, "alpha beta");
	assert.equal(result.tail, " gamma delta");
	assert.equal(result.head + result.tail, text);
});

test("truncateAtLine hard-cuts a single oversized word", () => {
	const text = "x".repeat(50);
	const result = truncateAtLine(text, 10);
	assert.equal(result.head, "x".repeat(10));
	assert.equal(result.tail, "x".repeat(40));
	assert.equal(result.head + result.tail, text);
});

test("firstLine collapses whitespace and ellipsizes long prompts", () => {
	assert.equal(firstLine("\n  hello   world  \nsecond line", 40), "hello world");
	assert.equal(firstLine("a very long single line of text", 8), "a very…");
	assert.equal(firstLine("   ", 10), "");
});
