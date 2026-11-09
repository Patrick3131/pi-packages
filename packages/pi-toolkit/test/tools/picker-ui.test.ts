import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import toolsExtension from "../../src/features/tools/index.js";

const KEYS = { down: "\u001b[B", confirm: "\r", cancel: "\u001b" };

test("the picker searches, filters, and saves without stealing letters", async (t) => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-tools-picker-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));

	const catalog = [
		{ name: "read", description: "Read a file", exposure: "direct" },
		{ name: "inline_actions", description: "Inline actions", exposure: "direct" },
		{ name: "source_check", description: "Check a source", exposure: "direct" },
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

	// Declared rows come first; walk past both inactive ones to the indirect row.
	for (let step = 0; step < 3; step += 1) {
		component.handleInput(KEYS.down);
	}
	assert.match(component.render(80).join("\n"), /→ agent_browser_action/);

	component.handleInput("?");
	const details = component.render(80).join("\n");
	assert.match(details, /exposure: deferred/);
	assert.match(details, /status: inactive \(indirect via deferred\)/);
	component.handleInput("?");
	component.handleInput(KEYS.confirm);
	assert.deepEqual(active, ["read"], "a read-only row never changes the active set");

	// i and s are printable now; they must narrow the list instead of running actions.
	component.handleInput("s");
	assert.match(component.render(80).join("\n"), /source_check/);
	component.handleInput("\u007f");
	component.handleInput("i");
	assert.match(component.render(80).join("\n"), /inline_actions/);
	component.handleInput("\u007f");

	component.handleInput("\t");
	let filtered = component.render(80).join("\n");
	assert.match(filtered, /tab filter: active/);
	assert.match(filtered, /→ read/);
	assert.doesNotMatch(filtered, /inline_actions/);
	assert.doesNotMatch(filtered, /agent_browser_action/);

	component.handleInput("\t");
	filtered = component.render(80).join("\n");
	assert.match(filtered, /tab filter: inactive/);
	assert.match(filtered, /→ inline_actions/);
	assert.match(filtered, /source_check/);
	assert.doesNotMatch(filtered, /agent_browser_action/);
	assert.doesNotMatch(filtered, /→ read/);

	component.handleInput(KEYS.confirm);
	assert.deepEqual(active, ["read", "inline_actions"]);
	assert.doesNotMatch(component.render(80).join("\n"), /inline_actions/);

	component.handleInput("\t");
	assert.match(component.render(80).join("\n"), /tab filter: all/);
	assert.match(component.render(80).join("\n"), /Reachable via tool_search \/ codemode/);

	component.handleInput("\u0013");
	const savedPath = join(cwd, ".pi", "tools.json");
	assert.ok(existsSync(savedPath));
	const saved = JSON.parse(readFileSync(savedPath, "utf8")) as Record<string, boolean>;
	assert.deepEqual(saved, {
		inline_actions: true,
		read: true,
		source_check: false,
	});

	component.handleInput(KEYS.cancel);
	await pending;
});
