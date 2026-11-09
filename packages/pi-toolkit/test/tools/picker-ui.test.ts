import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import toolsExtension from "../../src/features/tools/index.js";

const KEYS = { down: "\u001b[B", confirm: "\r", cancel: "\u001b" };

test("the picker shows indirect tools read-only and omits hidden ones", async (t) => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-tools-picker-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));

	const catalog = [
		{ name: "read", description: "Read a file", exposure: "direct" },
		{ name: "agent_browser_action", description: "Act on a browser", exposure: "deferred" },
		{ name: "secret", description: "Not reachable", exposure: "hidden" },
	];
	let active = ["read"];
	let command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	let component: { render: (width: number) => string[]; handleInput: (data: string) => void } | undefined;

	const bindings: Record<string, string> = {
		"tui.select.down": KEYS.down,
		"tui.select.confirm": KEYS.confirm,
		"tui.select.cancel": KEYS.cancel,
	};
	const keybindings = {
		matches: (data: string, binding: string) => bindings[binding] === data,
	};
	const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
	const ctx = {
		cwd,
		mode: "tui",
		hasUI: true,
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
			getHeader: () => ({ type: "session", id: "s", timestamp: "", cwd }),
		},
		ui: {
			notify: () => undefined,
			custom: (factory: (...args: unknown[]) => unknown) =>
				new Promise((resolve) => {
					component = factory({ requestRender() {} }, theme, keybindings, resolve) as typeof component;
				}),
		},
	} as unknown as ExtensionCommandContext;

	const pi = {
		appendEntry: () => undefined,
		getActiveTools: () => active,
		getAllTools: () => catalog,
		on: () => undefined,
		registerCommand: (_name: string, definition: { handler: typeof command }) => {
			command = definition.handler;
		},
		registerEntryRenderer: () => undefined,
		setActiveTools: (names: string[]) => {
			active = names;
		},
	} as unknown as ExtensionAPI;

	toolsExtension(pi);
	assert.ok(command);
	const pending = command("", ctx);

	assert.ok(component);
	const rendered = component.render(80).join("\n");
	assert.match(rendered, /→ read/);
	assert.match(rendered, /Reachable via tool_search \/ codemode/);
	assert.match(rendered, /agent_browser_action \[deferred\]/);
	assert.match(rendered, /1 hidden not shown/);
	assert.doesNotMatch(rendered, /secret/);

	component.handleInput(KEYS.down);
	component.handleInput(KEYS.confirm);
	assert.deepEqual(active, ["read"], "a read-only row never changes the active set");

	component.handleInput(KEYS.cancel);
	await pending;
});
