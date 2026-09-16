import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import presetExtension, { PRESET_STATE_ENTRY_TYPE } from "../src/preset.js";

interface RecordedEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

const ALL_TOOLS = ["read", "grep", "find", "ls", "bash", "edit", "write"];

/**
 * `pi-tools` decides whether `.pi/tools.json` may be applied by reading the
 * newest `preset-state` entry. A preset applied without recording that entry
 * gets its tool set silently overwritten by the project defaults again, which
 * is the regression these tests lock down. The record also has to happen during
 * `session_start`, before the first `before_agent_start` of the session.
 */
function createProject(presets: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-presets-state-"));
	mkdirSync(join(dir, ".pi"), { recursive: true });
	writeFileSync(join(dir, ".pi", "presets.json"), JSON.stringify(presets));
	return dir;
}

function createHarness(options: { cwd: string; presetFlag?: string }) {
	const entries: RecordedEntry[] = [];
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
	const commands = new Map<string, (args: string, ctx: ExtensionCommandContext) => Promise<void>>();
	const activeTools: string[] = [];

	const pi = {
		appendEntry: (customType: string, data: unknown) => {
			entries.push({ type: "custom", customType, data });
		},
		getActiveTools: () => [...activeTools],
		getAllTools: () => ALL_TOOLS.map((name) => ({ name })),
		getFlag: (name: string) => (name === "preset" ? options.presetFlag : undefined),
		getThinkingLevel: () => "medium",
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
			handlers.set(event, handler);
		},
		registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
			commands.set(name, command.handler);
		},
		registerFlag: () => undefined,
		registerShortcut: () => undefined,
		setActiveTools: (names: string[]) => {
			activeTools.length = 0;
			activeTools.push(...names);
		},
		setModel: async () => true,
		setThinkingLevel: () => undefined,
	} as unknown as ExtensionAPI;

	const ctx = {
		cwd: options.cwd,
		model: undefined,
		modelRegistry: { find: () => undefined },
		sessionManager: { getEntries: () => entries },
		ui: {
			notify: () => undefined,
			setStatus: () => undefined,
			theme: { fg: (_color: string, text: string) => text },
		},
	} as unknown as ExtensionContext;

	presetExtension(pi);
	return {
		ctx,
		entries,
		activeTools,
		sessionStart: handlers.get("session_start")!,
		runPreset: commands.get("preset")!,
	};
}

function presetStateEntries(entries: RecordedEntry[]): RecordedEntry[] {
	return entries.filter((entry) => entry.customType === PRESET_STATE_ENTRY_TYPE);
}

test("applying a preset from the CLI flag records the preset state", async () => {
	const cwd = createProject({ plan: { tools: ["read", "grep", "find", "ls"] } });
	const harness = createHarness({ cwd, presetFlag: "plan" });

	await harness.sessionStart({}, harness.ctx);

	assert.deepEqual(presetStateEntries(harness.entries), [
		{ type: "custom", customType: PRESET_STATE_ENTRY_TYPE, data: { name: "plan" } },
	]);
	assert.deepEqual(harness.activeTools, ["read", "grep", "find", "ls"]);
});

test("applying a preset from /preset records the preset state", async () => {
	const cwd = createProject({
		plan: { tools: ["read", "grep", "find", "ls"] },
		implement: { tools: ["read", "bash", "edit", "write"] },
	});
	const harness = createHarness({ cwd });
	await harness.sessionStart({}, harness.ctx);

	await harness.runPreset("implement", harness.ctx as unknown as ExtensionCommandContext);

	assert.deepEqual(presetStateEntries(harness.entries), [
		{ type: "custom", customType: PRESET_STATE_ENTRY_TYPE, data: { name: "implement" } },
	]);
	assert.deepEqual(harness.activeTools, ["read", "bash", "edit", "write"]);
});

test("a session without a preset records no preset state", async () => {
	const cwd = createProject({ plan: { tools: ["read", "grep", "find", "ls"] } });
	const harness = createHarness({ cwd });

	await harness.sessionStart({}, harness.ctx);

	assert.deepEqual(presetStateEntries(harness.entries), []);
});
