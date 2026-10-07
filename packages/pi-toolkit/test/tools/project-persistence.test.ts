import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { writeProjectToolsConfig } from "../../src/features/tools/project-config.js";
import toolsExtension from "../../src/features/tools/index.js";

const mcpTool = "mcp__admin__admin_save_brief";

function fixture(t: TestContext) {
	const cwd = mkdtempSync(join(tmpdir(), "pi-tools-prune-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const path = join(cwd, ".pi", "tools.json");
	writeProjectToolsConfig(path, { read: true, [mcpTool]: false, mcp: true, mcpScript: false });
	const events = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
	let command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	let active = ["read", mcpTool];
	const ctx = {
		cwd,
		mode: "rpc",
		sessionManager: {
			getEntries: () => [{ type: "custom", customType: "preset-state", data: { name: "ops" } }],
		},
		ui: { notify: () => undefined },
	} as unknown as ExtensionCommandContext;
	const pi = {
		getAllTools: () => ["read", mcpTool].map((name) => ({ name, description: name })),
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
	return {
		ctx,
		path,
		events,
		command: () => {
			assert.ok(command);
			return command;
		},
		active: () => active,
		defaults: () => JSON.parse(readFileSync(path, "utf8")),
	};
}

test("startup and agent-turn reconciliation persist removals without overriding a preset", async (t) => {
	const f = fixture(t);
	const start = f.events.get("session_start");
	assert.ok(start);
	await start({}, f.ctx);
	assert.deepEqual(f.defaults(), { read: true, [mcpTool]: false });
	assert.deepEqual(f.active(), ["read", mcpTool]);

	writeFileSync(f.path, JSON.stringify({ ...f.defaults(), removed_later: true }));
	const beforeTurn = f.events.get("before_agent_start");
	assert.ok(beforeTurn);
	await beforeTurn({}, f.ctx);
	assert.deepEqual(f.defaults(), { read: true, [mcpTool]: false });
	assert.deepEqual(f.active(), ["read", mcpTool]);
});

test("explicit save replaces stale defaults with the current registered snapshot", async (t) => {
	const f = fixture(t);
	await f.command()("save", f.ctx);
	assert.deepEqual(f.defaults(), { read: true, [mcpTool]: true });
});
