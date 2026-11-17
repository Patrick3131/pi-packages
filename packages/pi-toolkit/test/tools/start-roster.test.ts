import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import toolsExtension, { type ToolsPrintData } from "../../src/features/tools/index.js";

const ENV = "PI_TOOLS_LIST_AT_START";

interface FixtureOptions {
	/** Active tools at session start, as Pi's native selection left them. */
	active?: string[];
	/** Simulates a delegated child session, which carries a parent session path. */
	child?: boolean;
	/** Entries already in the transcript, e.g. a declared tool loadout. */
	entries?: unknown[];
}

function fixture(t: TestContext, options: FixtureOptions = {}) {
	const cwd = mkdtempSync(join(tmpdir(), "pi-tools-roster-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	mkdirSync(join(cwd, ".pi"), { recursive: true });
	const path = join(cwd, ".pi", "tools.json");
	const catalog = ["read", "bash", "crawl"];
	let active = [...(options.active ?? ["read"])];
	const events = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
	const notifications: Array<{ message: string; level: string }> = [];
	const appended: ToolsPrintData[] = [];
	const entries = options.entries ?? [];
	const ctx = {
		cwd,
		mode: "rpc",
		sessionManager: {
			getEntries: () => entries,
			getBranch: () => entries,
			getHeader: () => ({
				type: "session",
				id: "s",
				timestamp: "",
				cwd,
				...(options.child ? { parentSession: "/parent.jsonl" } : {}),
			}),
		},
		ui: {
			notify: (message: string, level: string) => notifications.push({ message, level }),
		},
	} as unknown as ExtensionContext;
	const pi = {
		appendEntry: (_type: string, data: ToolsPrintData) => {
			appended.push(data);
		},
		getAllTools: () => catalog.map((name) => ({ name, description: `Desc for ${name}` })),
		getActiveTools: () => active,
		setActiveTools: (names: string[]) => {
			active = names;
		},
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
			events.set(name, handler);
		},
		registerCommand: () => undefined,
		registerEntryRenderer: () => undefined,
	} as unknown as ExtensionAPI;
	toolsExtension(pi);

	return {
		appended,
		ctx,
		notifications,
		path,
		active: () => active,
		start: (reason?: string) => {
			const handler = events.get("session_start");
			assert.ok(handler);
			return handler(reason === undefined ? {} : { reason }, ctx);
		},
	};
}

async function withEnv(value: string | undefined, run: () => void | Promise<unknown>): Promise<void> {
	const previous = process.env[ENV];
	if (value === undefined) {
		delete process.env[ENV];
	} else {
		process.env[ENV] = value;
	}
	try {
		await run();
	} finally {
		if (previous === undefined) {
			delete process.env[ENV];
		} else {
			process.env[ENV] = previous;
		}
	}
}

test("the env-var roster prints on a fresh session after defaults are applied", async (t) => {
	await withEnv("1", async () => {
		const f = fixture(t);
		writeFileSync(f.path, `${JSON.stringify({ bash: true }, null, 2)}\n`);

		await f.start("startup");

		assert.equal(f.appended.length, 1);
		const entry = f.appended[0];
		assert.equal(entry.mode, "list");
		assert.equal(entry.query, undefined);
		assert.deepEqual(entry.toolNames, ["read", "bash", "crawl"]);
		// Project defaults were applied first, so the roster shows the state this
		// session actually runs with: bash enabled from the file, crawl inactive.
		assert.match(entry.text ?? "", /Tools \(3\) — 2 active · 1 inactive/);
		assert.match(entry.text ?? "", /active:\n {2}bash {2,}Desc for bash\n {2}read {2,}Desc for read/);
		assert.match(entry.text ?? "", /inactive:\n {2}crawl {2,}Desc for crawl/);
		// A transcript entry, not a toast: startup in non-TUI modes stays silent.
		assert.equal(f.notifications.length, 0);
	});
});

test("truthy spellings enable the roster", async (t) => {
	for (const value of ["true", "YES", "on"]) {
		const f = fixture(t);
		await withEnv(value, () => f.start("startup"));
		assert.equal(f.appended.length, 1, value);
	}
});

test("resume, fork, reload, and unknown reasons do not reprint", async (t) => {
	await withEnv("1", async () => {
		for (const reason of ["resume", "fork", "reload", undefined]) {
			const f = fixture(t);
			await f.start(reason);
			assert.equal(f.appended.length, 0, reason ?? "no reason");
		}
	});
});

test("the roster stays off unless the env var requests it", async (t) => {
	const f = fixture(t);
	await withEnv(undefined, () => f.start("startup"));
	assert.equal(f.appended.length, 0);
	await withEnv("0", () => f.start("startup"));
	assert.equal(f.appended.length, 0);
});

test("delegated child sessions and declared loadouts stay quiet", async (t) => {
	await withEnv("1", async () => {
		const child = fixture(t, { child: true });
		await child.start("startup");
		assert.equal(child.appended.length, 0);

		const loadout = fixture(t, {
			entries: [{ type: "message", message: { role: "system", toolsAdded: [{ name: "bash" }] } }],
		});
		await loadout.start("new");
		assert.equal(loadout.appended.length, 0);
	});
});
