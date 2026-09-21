import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { RecapExchange } from "../src/session.js";
import {
	applySummaries,
	buildTranscript,
	chunkExchanges,
	emptyCache,
	estimateSummary,
	hashExchange,
	loadSummaryCache,
	parseSummaryResponse,
	planSummary,
	runSummarize,
	saveSummaryCache,
	type RecapModelInfo,
	type RecapModelRegistryLike,
} from "../src/summarize.js";

function exchange(index: number, userText: string, answerText = `answer ${index}`): RecapExchange {
	return {
		index,
		userEntryId: `entry${index.toString().padStart(2, "0")}`,
		timestamp: "2026-09-21T10:00:00.000Z",
		userText,
		answerText,
		toolNames: [],
		toolCallCount: 0,
		toolErrorCount: 0,
	};
}

const model: RecapModelInfo = { provider: "test", id: "cheap-model", cost: { input: 2, output: 8 } };

function cachedRegistry(handler: (user: string, callIndex: number) => string | Error) {
	const calls: { systemPrompt?: string; messages: { role: string; content: string }[]; options?: Record<string, unknown> }[] = [];
	const registry: RecapModelRegistryLike = {
		find: () => undefined,
		streamSimple: (_model, context, options) => {
			calls.push({ ...(context as { systemPrompt?: string; messages: { role: string; content: string }[] }), options });
			const callIndex = calls.length;
			return {
				result: async () => {
					const user = (context as { messages: { content: string }[] }).messages[0].content;
					const outcome = handler(user, callIndex);
					if (outcome instanceof Error) throw outcome;
					return {
						content: [{ type: "text", text: outcome }],
						usage: { input: 100, output: 20, cost: { total: 0.0005 } },
					};
				},
			};
		},
	};
	return { registry, calls };
}

test("hashExchange is stable and changes with content", () => {
	const first = exchange(1, "hello", "world");
	assert.equal(hashExchange(first), hashExchange({ ...first }));
	assert.notEqual(hashExchange(first), hashExchange({ ...first, answerText: "changed" }));
	assert.notEqual(hashExchange(first), hashExchange({ ...first, userText: "changed" }));
});

test("planSummary keeps matching hashes cached and requests edited or new exchanges", () => {
	const first = exchange(1, "one");
	const second = exchange(2, "two");
	const third = exchange(3, "three");
	const cache = emptyCache();
	cache.entries[first.userEntryId] = { hash: hashExchange(first), text: "cached one" };
	cache.entries[second.userEntryId] = { hash: "stale-hash", text: "old two" };

	const plan = planSummary([first, second, third], cache);
	assert.deepEqual(plan.cached.map((item) => item.index), [1]);
	assert.deepEqual(plan.pending.map((item) => item.index), [2, 3]);
});

test("buildTranscript numbers user and assistant lines and caps long content", () => {
	const transcript = buildTranscript([exchange(1, "question one", "answer one"), exchange(2, "question two", "")], {
		maxCharsPerPrompt: 5,
		maxCharsPerAnswer: 6,
	});
	assert.ok(transcript.includes("[1] user: quest…"));
	assert.ok(transcript.includes("[1] assistant: answer…"));
	assert.ok(transcript.includes("[2] user: quest…"));
	assert.ok(transcript.includes("[2] assistant: (no answer)"));
});

test("parseSummaryResponse accepts JSONL, fenced JSONL with bad lines, and arrays", () => {
	const plain = parseSummaryResponse('{"id":1,"tl;dr":"one"}\n{"id":2,"tldr":"two"}');
	assert.equal(plain.get(1), "one");
	assert.equal(plain.get(2), "two");

	const fenced = parseSummaryResponse(['```json', '{"id":3,"tl;dr":"three"}', "{oops", '{"id":4,"summary":"four"}', "```"].join("\n"));
	assert.equal(fenced.get(3), "three");
	assert.equal(fenced.get(4), "four");
	assert.equal(fenced.size, 2);

	const array = parseSummaryResponse('[{"id":5,"tl;dr":"five"}]');
	assert.equal(array.get(5), "five");
});

test("chunkExchanges respects the budget and covers every exchange in order", () => {
	const exchanges = Array.from({ length: 7 }, (_, index) => exchange(index + 1, `question ${index + 1}`, "a".repeat(400)));
	const chunks = chunkExchanges(exchanges, 150, { maxCharsPerPrompt: 400, maxCharsPerAnswer: 400 });
	assert.ok(chunks.length > 1);
	assert.deepEqual(
		chunks.flat().map((item) => item.index),
		exchanges.map((item) => item.index),
	);
});

test("estimateSummary derives tokens and cost from the transcript and model rates", () => {
	const exchanges = [exchange(1, "question"), exchange(2, "another question")];
	const estimate = estimateSummary(exchanges, [], model.cost, {});
	assert.equal(estimate.exchanges, 2);
	assert.ok(estimate.inputTokens > 0);
	assert.ok(estimate.outputTokens >= 2 * 80);
	const expected = (estimate.inputTokens * model.cost.input) / 1_000_000 + (estimate.outputTokens * model.cost.output) / 1_000_000;
	assert.ok(Math.abs(estimate.costUsd - expected) < 1e-12);
});

test("runSummarize summarizes pending exchanges, caches them, and skips unchanged content on re-run", async () => {
	const exchanges = [exchange(1, "one"), exchange(2, "two")];
	const cache = emptyCache();
	const { registry, calls } = cachedRegistry((user) => {
		const ids = [...user.matchAll(/^\[(\d+)\] user:/gmu)].map((match) => Number(match[1]));
		return ids.map((id) => JSON.stringify({ id, "tl;dr": `tl;dr ${id}` })).join("\n");
	});

	const first = await runSummarize({ exchanges, cache, model, registry, sessionId: "sess-1" });
	assert.equal(first.report.status, "ok");
	assert.equal(first.report.summarized, 2);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].options?.sessionId, "sess-1", "provider session routing must be forwarded");
	assert.equal(calls[0].options?.reasoning, "off");
	assert.equal(exchanges[0].summary, "tl;dr 1");
	assert.equal(exchanges[1].summary, "tl;dr 2");

	const second = await runSummarize({ exchanges, cache: first.cache, model, registry });
	assert.equal(second.report.status, "ok");
	assert.equal(second.report.summarized, 0);
	assert.equal(second.report.cached, 2);
	assert.equal(calls.length, 1, "unchanged exchanges must not trigger another model call");

	exchanges[1].answerText = "changed";
	await runSummarize({ exchanges, cache: second.cache, model, registry });
	assert.equal(calls.length, 2);
	assert.ok(calls[1].messages[0].content.includes("[2]"));
	assert.equal(calls[1].messages[0].content.includes("[1] user:"), false);
	assert.ok(calls[1].messages[0].content.includes("tl;dr 1"), "cached TL;DRs provide continuity context");
});

test("runSummarize honors a declined confirmation without calling the model", async () => {
	const exchanges = [exchange(1, "one")];
	const { registry, calls } = cachedRegistry(() => '{"id":1,"tl;dr":"x"}');
	const result = await runSummarize({
		exchanges,
		cache: emptyCache(),
		model,
		registry,
		confirm: async () => false,
	});
	assert.equal(result.report.status, "skipped");
	assert.equal(calls.length, 0);
	assert.equal(exchanges[0].summary, undefined);
});

test("runSummarize falls back on model failure and keeps previous summaries", async () => {
	const exchanges = [exchange(1, "one"), exchange(2, "two")];
	const cache = emptyCache();
	cache.entries[exchanges[0].userEntryId] = { hash: hashExchange(exchanges[0]), text: "old summary" };

	const { registry } = cachedRegistry((user) => (user.includes("[2]") ? new Error("rate limited") : '{"id":2,"tl;dr":"new"}'));
	const result = await runSummarize({ exchanges, cache, model, registry });
	assert.equal(result.report.status, "failed");
	assert.ok(result.report.error?.includes("rate limited"));
	assert.equal(exchanges[0].summary, "old summary");
	assert.equal(result.report.cached, 1);
});

test("runSummarize works with a registry that only implements complete()", async () => {
	const exchanges = [exchange(1, "one")];
	const registry: RecapModelRegistryLike = {
		find: () => undefined,
		complete: async () => ({ content: [{ type: "text", text: '{"id":1,"tl;dr":"via complete"}' }] }),
	};
	const result = await runSummarize({ exchanges, cache: emptyCache(), model, registry });
	assert.equal(result.report.status, "ok");
	assert.equal(exchanges[0].summary, "via complete");
});

test("summary cache round-trips and tolerates a corrupt file", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-summary-"));
	const file = join(dir, "cache.json");
	const cache = emptyCache();
	cache.entries.aaaa = { hash: "h", text: "value" };
	saveSummaryCache(file, cache);
	const loaded = loadSummaryCache(file);
	assert.deepEqual(loaded.entries.aaaa, { hash: "h", text: "value" });

	writeFileSync(file, "{not json", "utf-8");
	assert.deepEqual(loadSummaryCache(file).entries, {});
	assert.deepEqual(loadSummaryCache(join(dir, "missing.json")).entries, {});
});

test("applySummaries attaches only summaries whose hash matches", () => {
	const first = exchange(1, "one");
	const second = exchange(2, "two");
	const cache = emptyCache();
	cache.entries[first.userEntryId] = { hash: hashExchange(first), text: "one summary" };
	cache.entries[second.userEntryId] = { hash: "stale", text: "two summary" };
	applySummaries([first, second], cache);
	assert.equal(first.summary, "one summary");
	assert.equal(second.summary, undefined);
});
