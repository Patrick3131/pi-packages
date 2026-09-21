import assert from "node:assert/strict";
import test from "node:test";

import type { RecapDocument } from "../src/document.js";
import type { RecapExchange } from "../src/session.js";
import { renderRecapText } from "../src/text-report.js";

function exchange(overrides: Partial<RecapExchange> = {}): RecapExchange {
	return {
		index: 1,
		userEntryId: "aaaa1111",
		timestamp: "2026-09-21T10:00:00.000Z",
		userText: "How do I export a session?",
		answerText: "Use /export.",
		toolNames: ["bash"],
		toolCallCount: 2,
		toolErrorCount: 0,
		...overrides,
	};
}

function document(exchanges: RecapExchange[], previewChars = 320, messages = false): RecapDocument {
	return {
		title: "Recap session",
		generatedAt: "2026-09-21T12:00:00.000Z",
		previewChars,
		messages,
		session: {
			sessionId: "11111111-2222-3333-4444-555555555555",
			cwd: "/work/project",
			model: "anthropic/claude-sonnet-4-5",
			stats: { totalEntries: 9, userMessages: 1, assistantMessages: 1, toolResults: 2, compactions: 0 },
			exchanges,
		},
	};
}

test("renderRecapText emits a header and per-exchange sections", () => {
	const text = renderRecapText(document([exchange(), exchange({ index: 2, userEntryId: "bbbb2222", userText: "Second?" })]));
	assert.ok(text.includes("# Recap session"));
	assert.ok(text.includes("11111111-2222-3333-4444-555555555555"));
	assert.ok(text.includes("## 1. How do I export a session?"));
	assert.ok(text.includes("## 2. Second?"));
	assert.ok(text.includes("Use /export."));
});

test("renderRecapText truncates long answers and marks the remainder", () => {
	const answer = `first line\n${"more text ".repeat(100)}`;
	const text = renderRecapText(document([exchange({ answerText: answer })], 20));
	assert.ok(text.includes("first line"));
	assert.ok(text.includes("… [truncated,"));
	assert.equal(text.includes("more text more text"), false);
});

test("renderRecapText messages mode keeps full answers and drops recap lines", () => {
	const answer = `first line\n${"more text ".repeat(80)}`;
	const text = renderRecapText(
		document([exchange({ answerText: answer, summary: "ignored", toolCallCount: 2, toolNames: ["bash"] })], 40, true),
	);
	assert.ok(text.includes("# Messages"));
	assert.ok(text.includes("more text more text"));
	assert.equal(text.includes("truncated"), false);
	assert.equal(text.includes("TL;DR"), false);
	assert.equal(text.includes("tools:"), false);
});

test("renderRecapText renders summaries and tool lines", () => {
	const text = renderRecapText(
		document([exchange({ summary: "Explained /export.", toolNames: ["bash", "read"], toolCallCount: 5, toolErrorCount: 1 })]),
	);
	assert.ok(text.includes("TL;DR: Explained /export."));
	assert.ok(text.includes("tools: 5 calls (bash, read), 1 error"));
});
