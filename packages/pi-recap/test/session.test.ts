import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildBranch,
	extractRecap,
	parseSessionJsonl,
	readSessionFile,
	type SessionEntry,
} from "../src/session.js";

const header = {
	type: "session",
	version: 3,
	id: "11111111-2222-3333-4444-555555555555",
	timestamp: "2026-09-21T10:00:00.000Z",
	cwd: "/work/project",
};

function entry(id: string, parentId: string | null, message: Record<string, unknown>, timestamp = "2026-09-21T10:00:01.000Z") {
	return { type: "message", id, parentId, timestamp, message };
}

const branch = [
	header,
	entry("aaaaaaaa", null, { role: "system", content: "SYSTEM PROMPT", timestamp: 1 }),
	entry("bbbbbbbb", "aaaaaaaa", { role: "user", content: "first question", timestamp: 2 }),
	entry("cccccccc", "bbbbbbbb", {
		role: "assistant",
		content: [
			{ type: "thinking", thinking: "SECRET THINKING" },
			{ type: "text", text: "first part" },
			{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
		],
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		stopReason: "toolUse",
		timestamp: 3,
	}),
	entry("dddddddd", "cccccccc", { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: "HUGE TOOL OUTPUT" }], isError: false, timestamp: 4 }),
	entry("eeeeeeee", "dddddddd", {
		role: "assistant",
		content: [
			{ type: "text", text: "second part" },
			{ type: "toolCall", id: "t2", name: "read", arguments: {} },
			{ type: "toolCall", id: "t3", name: "bash", arguments: {} },
		],
		stopReason: "stop",
		timestamp: 5,
	}),
	entry("ffffffff", "eeeeeeee", { role: "toolResult", toolCallId: "t2", toolName: "read", content: [{ type: "text", text: "more tool output" }], isError: true, timestamp: 6 }),
	{ type: "compaction", id: "gggggggg", parentId: "ffffffff", timestamp: "2026-09-21T10:00:07.000Z", summary: "COMPACTION SUMMARY", firstKeptEntryId: "bbbbbbbb" },
	entry("hhhhhhhh", "gggggggg", { role: "user", content: [{ type: "text", text: "second question" }, { type: "image", data: "AAA", mimeType: "image/png" }], timestamp: 8 }),
	{ type: "session_info", id: "iiiiiiii", parentId: "hhhhhhhh", timestamp: "2026-09-21T10:00:09.000Z", name: "Recap session" },
];

const jsonl = branch.map((line) => JSON.stringify(line)).join("\n");

test("parseSessionJsonl separates the header, entries, and malformed lines", () => {
	const parsed = parseSessionJsonl(`${jsonl}\n{not json\n`);
	assert.equal(parsed.header?.id, "11111111-2222-3333-4444-555555555555");
	assert.equal(parsed.skippedLines, 1);
	assert.equal(parsed.entries.length, branch.length - 1);
	assert.ok(parsed.entries.every((item) => typeof item.id === "string"));
});

test("buildBranch walks parent links from the last entry", () => {
	const { entries } = parseSessionJsonl(jsonl);
	const walked = buildBranch(entries);
	assert.deepEqual(
		walked.map((item) => item.id),
		["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd", "eeeeeeee", "ffffffff", "gggggggg", "hhhhhhhh", "iiiiiiii"],
	);
});

test("buildBranch falls back to file order for linear sessions", () => {
	const linear: SessionEntry[] = [
		{ type: "message", id: "one", parentId: null, timestamp: "t", message: { role: "user", content: "hi" } },
		{ type: "message", id: "two", parentId: null, timestamp: "t", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } },
	];
	assert.deepEqual(
		buildBranch(linear).map((item) => item.id),
		["one", "two"],
	);
});

test("buildBranch ignores an abandoned branch and keeps the active leaf path", () => {
	const forked: SessionEntry[] = [
		{ type: "message", id: "u1", parentId: null, timestamp: "t", message: { role: "user", content: "root" } },
		{ type: "message", id: "a1", parentId: "u1", timestamp: "t", message: { role: "assistant", content: [{ type: "text", text: "old" }] } },
		{ type: "message", id: "u2", parentId: "a1", timestamp: "t", message: { role: "user", content: "new root" } },
		{ type: "message", id: "a2", parentId: "u2", timestamp: "t", message: { role: "assistant", content: [{ type: "text", text: "new" }] } },
	];
	assert.deepEqual(
		buildBranch(forked).map((item) => item.id),
		["u1", "a1", "u2", "a2"],
	);
});

test("extractRecap groups exchanges and drops tool, thinking, and system content", () => {
	const { entries } = parseSessionJsonl(jsonl);
	const recap = extractRecap(buildBranch(entries), { sessionId: header.id });

	assert.equal(recap.exchanges.length, 2);
	const [first, second] = recap.exchanges;
	assert.equal(first.userText, "first question");
	assert.equal(first.answerText, "first part\n\nsecond part");
	assert.equal(first.answerText.includes("HUGE TOOL OUTPUT"), false);
	assert.equal(first.answerText.includes("SECRET THINKING"), false);
	assert.deepEqual(first.toolNames, ["bash", "read"]);
	assert.equal(first.toolCallCount, 3);
	assert.equal(first.toolErrorCount, 1);
	assert.equal(second.userText, "second question\n[image]");
	assert.equal(second.answerText, "");
	assert.equal(recap.name, "Recap session");
	assert.equal(recap.model, "anthropic/claude-sonnet-4-5");
	assert.deepEqual(recap.stats, {
		totalEntries: branch.length - 1,
		userMessages: 2,
		assistantMessages: 2,
		toolResults: 2,
		compactions: 1,
	});
});

test("readSessionFile reads a session file from disk", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-"));
	const file = join(dir, "2026-09-21_11111111-2222-3333-4444-555555555555.jsonl");
	writeFileSync(file, jsonl, "utf-8");

	const recap = readSessionFile(file);
	assert.equal(recap.sessionId, header.id);
	assert.equal(recap.exchanges.length, 2);
});
