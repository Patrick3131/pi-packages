import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { writeProjectToolsConfig } from "../../src/features/tools/project-config.js";
import toolsExtension from "../../src/features/tools/index.js";

const mcpTool = "mcp__admin__admin_save_brief";

interface FixtureOptions {
	/** Catalog this session registers, standing in for a restricted or partial catalog. */
	catalog?: string[];
	/** Active tools at session start, as Pi's native selection left them. */
	active?: string[];
	entries?: unknown[];
	/** Entries of the current branch, when they differ from the whole session file. */
	branchEntries?: unknown[];
	/** Simulates a delegated child session, which carries a parent session path. */
	child?: boolean;
	/** Pi's exposure per catalog name; anything unlisted is `direct`. */
	exposures?: Record<string, string>;
}

function fixture(t: TestContext, options: FixtureOptions = {}) {
	const cwd = mkdtempSync(join(tmpdir(), "pi-tools-persist-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	mkdirSync(join(cwd, ".pi"), { recursive: true });
	const path = join(cwd, ".pi", "tools.json");
	const catalog = options.catalog ?? ["read", mcpTool];
	const events = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
	let command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	let active = [...(options.active ?? ["read", mcpTool])];
	const notifications: Array<{ message: string; level: string }> = [];
	const entries = options.entries ?? [];
	const ctx = {
		cwd,
		mode: "rpc",
		sessionManager: {
			getEntries: () => entries,
			getBranch: () => options.branchEntries ?? entries,
			getHeader: () => ({ type: "session", id: "s", timestamp: "", cwd, ...(options.child ? { parentSession: "/parent.jsonl" } : {}) }),
		},
		ui: {
			notify: (message: string, level: string) => notifications.push({ message, level }),
		},
	} as unknown as ExtensionCommandContext;
	const pi = {
		appendEntry: () => undefined,
		getAllTools: () =>
			catalog.map((name) => ({ name, description: name, exposure: options.exposures?.[name] ?? "direct" })),
		getActiveTools: () => active,
		setActiveTools: (names: string[]) => {
			active = names;
		},
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
			events.set(name, handler);
		},
		registerCommand: (_name: string, definition: { handler: typeof command }) => {
			command = definition.handler;
		},
		registerEntryRenderer: () => undefined,
	} as unknown as ExtensionAPI;
	toolsExtension(pi);

	const bytes = () => (existsSync(path) ? readFileSync(path, "utf8") : undefined);
	return {
		ctx,
		path,
		events,
		notifications,
		command: () => {
			assert.ok(command);
			return command;
		},
		active: () => active,
		bytes,
		start: () => {
			const handler = events.get("session_start");
			assert.ok(handler);
			return handler({}, ctx);
		},
	};
}

test("no lifecycle event writes the file, and defaults only override mentioned tools", async (t) => {
	const f = fixture(t);
	writeFileSync(
		f.path,
		`${JSON.stringify({ read: true, bash: false, gone: true }, null, 2)}\n`,
	);
	const before = f.bytes();

	await f.start();

	assert.equal(f.bytes(), before);
	// `bash: false` is respected, `read: true` keeps working, and the name this
	// catalog does not register is left alone rather than applied or removed.
	assert.deepEqual(f.active(), ["read", mcpTool]);
});

test("a partial catalog cannot delete preferences it cannot see", async (t) => {
	const saved = { read: true, bash: true, crawl: true, [mcpTool]: true };
	const f = fixture(t, { catalog: ["read", "bash"], active: [] });
	writeFileSync(f.path, `${JSON.stringify(saved, null, 2)}\n`);
	const before = f.bytes();

	await f.start();
	await f.command()("save", f.ctx);

	// The unreachable keys survive the save untouched.
	assert.deepEqual(JSON.parse(f.bytes() ?? "{}"), { read: true, bash: true, crawl: true, [mcpTool]: true });
	assert.notEqual(before, undefined);
});

test("an explicit save records the current session set and preserves unknown keys", async (t) => {
	// The MCP server is connected with deferred exposure, so its tools are inactive
	// without that being a decision. The save must not write them as `false`.
	const f = fixture(t, { active: ["read"], exposures: { [mcpTool]: "deferred" } });
	writeFileSync(f.path, `${JSON.stringify({ mcp__other__gone: true }, null, 2)}\n`);

	await f.command()("save", f.ctx);

	assert.deepEqual(JSON.parse(f.bytes() ?? "{}"), { mcp__other__gone: true, read: true });
});

test("a save writes only decisions Pi enforces", async (t) => {
	const f = fixture(t, {
		catalog: ["read", "bash", "crawl", "tool_search", "mcp__admin__admin_save_brief", "mcp__admin__gone"],
		active: ["read", "tool_search"],
		exposures: {
			crawl: "codemode",
			"mcp__admin__admin_save_brief": "deferred",
			"mcp__admin__gone": "hidden",
		},
	});

	await f.command()("save", f.ctx);

	// Declared-switch tools record their real state, on and off. `codemode`,
	// `deferred`, and `hidden` tools record nothing: Pi reaches or withholds them by
	// exposure, so an entry would be a decision this file cannot honor.
	assert.deepEqual(JSON.parse(f.bytes() ?? "{}"), { bash: false, read: true, tool_search: true });
});

test("a missing file stays missing until an explicit save", async (t) => {
	const f = fixture(t);
	assert.equal(f.bytes(), undefined);
	await f.start();
	assert.equal(f.bytes(), undefined);

	await f.command()("save", f.ctx);
	assert.deepEqual(JSON.parse(f.bytes() ?? "{}"), { read: true, [mcpTool]: true });
});

test("a malformed file is reported and never replaced", async (t) => {
	const f = fixture(t);
	writeFileSync(f.path, "{ not json");
	const before = f.bytes();

	await f.start();
	await f.command()("save", f.ctx);

	assert.equal(f.bytes(), before);
	assert.equal(f.notifications.length, 2);
	assert.equal(f.notifications[1]?.level, "error");
	assert.match(f.notifications[1]?.message ?? "", /not valid JSON/);
});

test("a delegated child session neither applies nor saves project preferences", async (t) => {
	const f = fixture(t, { child: true, active: ["read"] });
	writeFileSync(f.path, `${JSON.stringify({ read: true, [mcpTool]: true }, null, 2)}\n`);
	const before = f.bytes();

	await f.start();
	await f.command()("save", f.ctx);

	// The child's own tool set is untouched, and the file is not saved from it.
	assert.deepEqual(f.active(), ["read"]);
	assert.equal(f.bytes(), before);
	assert.equal(f.notifications.at(-1)?.level, "warning");
});

test("a session that already declared a loadout keeps it", async (t) => {
	const entries = [
		{ type: "message", message: { role: "system", toolsAdded: [{ name: "bash" }] } },
	];
	const f = fixture(t, { active: ["bash"], entries });
	writeFileSync(f.path, `${JSON.stringify({ read: true, bash: false }, null, 2)}\n`);

	await f.start();

	assert.deepEqual(f.active(), ["bash"]);
});

test("an active preset owns the tool set and the file stays unread", async (t) => {
	const entries = [{ type: "custom", customType: "preset-state", data: { name: "ops" } }];
	const f = fixture(t, { active: ["read", "bash"], catalog: ["read", "bash"], entries });
	writeFileSync(f.path, `${JSON.stringify({ read: true, bash: false }, null, 2)}\n`);

	await f.start();

	assert.deepEqual(f.active(), ["read", "bash"]);
});


test("a preset entry left on an abandoned branch does not own this session", async (t) => {
	const abandoned = [{ type: "custom", customType: "preset-state", data: { name: "ops" } }];
	const f = fixture(t, {
		active: ["read", "bash"],
		catalog: ["read", "bash"],
		entries: abandoned,
		branchEntries: [],
	});
	writeFileSync(f.path, `${JSON.stringify({ read: true, bash: false }, null, 2)}\n`);

	await f.start();

	// The current branch has no preset, so the project file is the owner again.
	assert.deepEqual(f.active(), ["read"]);
});
