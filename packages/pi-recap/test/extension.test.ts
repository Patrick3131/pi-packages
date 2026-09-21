import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import recapExtension, { autoSummarize, handleRecapCommand } from "../src/index.js";
import type { RecapModelInfo } from "../src/summarize.js";

type RegisteredCommand = {
	description?: string;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

function writeSession(dir: string, sessionId: string, exchanges: { user: string; answer: string }[]): string {
	const lines = [
		JSON.stringify({
			type: "session",
			version: 3,
			id: sessionId,
			timestamp: "2026-09-21T09:00:00.000Z",
			cwd: dir,
		}),
	];
	let parent: string | null = null;
	exchanges.forEach((exchange, index) => {
		const userId = `user-${index}`;
		const assistantId = `assistant-${index}`;
		lines.push(
			JSON.stringify({
				type: "message",
				id: userId,
				parentId: parent,
				timestamp: `2026-09-21T09:0${index}:00.000Z`,
				message: { role: "user", content: exchange.user, timestamp: 1 },
			}),
		);
		lines.push(
			JSON.stringify({
				type: "message",
				id: assistantId,
				parentId: userId,
				timestamp: `2026-09-21T09:0${index}:01.000Z`,
				message: {
					role: "assistant",
					content: [{ type: "text", text: exchange.answer }],
					provider: "test",
					model: "session-model",
					stopReason: "stop",
					timestamp: 2,
				},
			}),
		);
		parent = assistantId;
	});
	const file = join(dir, `${sessionId}.jsonl`);
	writeFileSync(file, lines.join("\n"), "utf-8");
	return file;
}

function harness() {
	const commands = new Map<string, RegisteredCommand>();
	const events = new Map<string, (...args: never[]) => unknown>();
	const execCalls: string[][] = [];
	const pi = {
		registerCommand: (name: string, options: RegisteredCommand) => {
			commands.set(name, options);
		},
		on: (event: string, handler: (...args: never[]) => unknown) => {
			events.set(event, handler);
		},
		exec: async (command: string, args: string[]) => {
			execCalls.push([command, ...args]);
			return { stdout: "", stderr: "", code: 0, killed: false };
		},
	} as unknown as ExtensionAPI;
	return { pi, commands, events, execCalls };
}

interface ContextOptions {
	file: string;
	confirm?: boolean;
	registry?: Partial<Record<string, unknown>>;
}

function makeContext(options: ContextOptions) {
	const notifications: { message: string; level: string }[] = [];
	const modelCalls: string[] = [];
	const defaultModel: RecapModelInfo = { provider: "test", id: "cheap", cost: { input: 1, output: 1 } };
	const registry = {
		find: (_provider: string, id: string) => ({ provider: "test", id, cost: { input: 1, output: 1 } }),
		streamSimple: (_model: unknown, context: { messages: { content: string }[] }) => {
			modelCalls.push(context.messages[0].content);
			const ids = [...context.messages[0].content.matchAll(/^\[(\d+)\] user:/gmu)].map((match) => Number(match[1]));
			const text = ids.map((id) => JSON.stringify({ id, "tl;dr": `summary ${id}` })).join("\n");
			return {
				result: async () => ({
					content: [{ type: "text", text }],
					usage: { input: 10, output: 5, cost: { total: 0.0001 } },
				}),
			};
		},
		...options.registry,
	};
	const ctx = {
		cwd: options.file,
		hasUI: true,
		signal: undefined,
		ui: {
			notify: (message: string, level = "info") => {
				notifications.push({ message, level });
			},
			confirm: async () => options.confirm ?? true,
		},
		sessionManager: {
			getSessionFile: () => options.file,
			getSessionId: () => "11111111-2222-3333-4444-555555555555",
			getBranch: () => [],
		},
		model: defaultModel,
		modelRegistry: registry,
	} as unknown as ExtensionCommandContext;
	return { ctx, notifications, modelCalls };
}

function withRecapDir<T>(dir: string, run: () => Promise<T>): Promise<T> {
	process.env.PI_RECAP_DIR = dir;
	return run().finally(() => {
		delete process.env.PI_RECAP_DIR;
	});
}

function firstFile(dir: string, extension: string): string {
	const name = readdirSync(dir).find((entry) => entry.endsWith(extension));
	assert.ok(name, `expected a ${extension} file in ${dir}`);
	return join(dir, name);
}

test("recapExtension registers /recap, /user-messages, and the auto-summary hook", () => {
	const { pi, commands, events } = harness();
	recapExtension(pi);
	assert.ok(commands.has("recap"));
	assert.ok(commands.has("user-messages"));
	assert.ok(events.has("turn_end"));
});

test("handleRecapCommand writes HTML and honors --limit, --full, and --no-open", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-ext-"));
	await withRecapDir(dir, async () => {
		const file = writeSession(dir, "session-a", [
			{ user: "first question", answer: "first answer" },
			{ user: "second question", answer: "second answer" },
		]);
		const { pi, execCalls } = harness();
		const { ctx } = makeContext({ file });
		await handleRecapCommand(pi, "--limit 1 --full --no-open", ctx);

		const html = readFileSync(firstFile(dir, ".html"), "utf-8");
		assert.ok(html.includes("second question"));
		assert.equal(html.includes("first question"), false);
		assert.equal(html.includes("<details"), false);
		assert.equal(execCalls.length, 0, "--no-open must not launch a browser");
	});
});

test("handleRecapCommand opens the browser and writes a text recap", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-ext-"));
	await withRecapDir(dir, async () => {
		const file = writeSession(dir, "session-a", [{ user: "only question", answer: "only answer" }]);
		const browser = harness();
		await handleRecapCommand(browser.pi, "", makeContext({ file }).ctx);
		assert.equal(browser.execCalls.length, 1);
		assert.equal(browser.execCalls[0][0], process.platform === "darwin" ? "open" : browser.execCalls[0][0]);

		const text = harness();
		await handleRecapCommand(text.pi, "--text --no-open", makeContext({ file }).ctx);
		const report = readFileSync(firstFile(dir, ".txt"), "utf-8");
		assert.ok(report.includes("## 1. only question"));
		assert.equal(text.execCalls.length, 0);
	});
});

test("handleRecapCommand summarizes with a model, caches results, and skips unchanged content", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-ext-"));
	await withRecapDir(dir, async () => {
		const file = writeSession(dir, "session-a", [
			{ user: "alpha question", answer: "alpha answer" },
			{ user: "beta question", answer: "beta answer" },
		]);
		const first = makeContext({ file });
		await handleRecapCommand(harness().pi, "--summarize --model test/cheap --yes --no-open", first.ctx);
		assert.equal(first.modelCalls.length, 1);
		const html = readFileSync(firstFile(dir, ".html"), "utf-8");
		assert.ok(html.includes("TL;DR"));
		assert.ok(html.includes("summary 1"));
		assert.ok(html.includes("summary 2"));

		const second = makeContext({ file });
		await handleRecapCommand(harness().pi, "--summarize --model test/cheap --yes --no-open", second.ctx);
		assert.equal(second.modelCalls.length, 0, "cached summaries must not trigger another model call");
	});
});

test("handleRecapCommand renders without summaries when the confirmation is declined or the model fails", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-ext-"));
	await withRecapDir(dir, async () => {
		const file = writeSession(dir, "session-a", [{ user: "question", answer: "answer" }]);

		const declined = makeContext({ file, confirm: false });
		await handleRecapCommand(harness().pi, "--summarize --model test/cheap --no-open", declined.ctx);
		assert.equal(declined.modelCalls.length, 0);
		assert.ok(readFileSync(firstFile(dir, ".html"), "utf-8").includes("skipped"));

		const failing = makeContext({
			file,
			registry: {
				streamSimple: () => {
					throw new Error("provider exploded");
				},
			},
		});
		await handleRecapCommand(harness().pi, "--summarize --model test/cheap --yes --no-open", failing.ctx);
		assert.ok(readFileSync(firstFile(dir, ".html"), "utf-8").includes("question"));
		assert.ok(failing.notifications.some((entry) => entry.level === "warning" && entry.message.includes("provider exploded")));
	});
});

test("handleRecapCommand supports help, --messages, and retention cleanup", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-ext-"));
	await withRecapDir(dir, async () => {
		const file = writeSession(dir, "session-a", [{ user: "question one", answer: "long answer ".repeat(60) }]);

		const helpCtx = makeContext({ file });
		await handleRecapCommand(harness().pi, "help", helpCtx.ctx);
		assert.ok(helpCtx.notifications.some((entry) => entry.message.includes("/recap") && entry.message.includes("--messages")));

		const messagesCtx = makeContext({ file });
		await handleRecapCommand(harness().pi, "--messages --no-open", messagesCtx.ctx);
		const messagesHtml = readFileSync(firstFile(dir, ".html"), "utf-8");
		assert.ok(messagesHtml.includes("<title>Messages — session-a</title>"));
		assert.equal(messagesHtml.includes('class="summary"'), false);
		assert.equal(messagesHtml.includes('class="tools"'), false);
		assert.ok(messagesHtml.includes("long answer"));

		const stale = join(dir, "recap-session-old-20260101-000000.html");
		writeFileSync(stale, "old", "utf-8");
		const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		utimesSync(stale, oldTime, oldTime);
		const cleanupCtx = makeContext({ file });
		await handleRecapCommand(harness().pi, "--no-open", cleanupCtx.ctx);
		assert.equal(existsSync(stale), false, "recaps older than 14 days are deleted");
		assert.ok(cleanupCtx.notifications.some((entry) => entry.message.includes("Cleaned up")));
	});
});

test("auto on persists settings and autoSummarize fills the cache without repeats", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-ext-"));
	await withRecapDir(dir, async () => {
		const file = writeSession(dir, "session-a", [{ user: "auto question", answer: "auto answer" }]);
		await handleRecapCommand(harness().pi, "auto on", makeContext({ file }).ctx);
		assert.equal(JSON.parse(readFileSync(join(dir, "settings.json"), "utf-8")).auto, true);

		const first = makeContext({ file });
		await autoSummarize(first.ctx);
		assert.equal(first.modelCalls.length, 1);
		assert.ok(existsSync(join(dir, "summary-session-a.json")));

		const second = makeContext({ file });
		await autoSummarize(second.ctx);
		assert.equal(second.modelCalls.length, 0, "auto summarize must reuse the cache");

		await handleRecapCommand(harness().pi, "auto off", makeContext({ file }).ctx);
		assert.equal(JSON.parse(readFileSync(join(dir, "settings.json"), "utf-8")).auto, false);
	});
});
