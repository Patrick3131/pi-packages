import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import toolsExtension, { type ToolsPrintData } from "../src/tools.js";

test("bare /tools prints the catalog outside TUI mode", async () => {
	let handler: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	let appended: ToolsPrintData | undefined;
	const notifications: Array<{ message: string; level: string }> = [];

	const pi = {
		appendEntry: (_type: string, data: ToolsPrintData) => {
			appended = data;
		},
		getActiveTools: () => ["read"],
		getAllTools: () => [{ name: "read", description: "Read a file" }],
		on: () => undefined,
		registerCommand: (_name: string, command: { handler: typeof handler }) => {
			handler = command.handler;
		},
		registerEntryRenderer: () => undefined,
		setActiveTools: () => undefined,
	} as unknown as ExtensionAPI;

	toolsExtension(pi);
	assert.ok(handler);

	await handler("", {
		cwd: "/workspace/melon-labs",
		mode: "rpc",
		ui: {
			notify: (message: string, level: string) => notifications.push({ message, level }),
		},
	} as unknown as ExtensionCommandContext);

	assert.deepEqual(appended?.toolNames, ["read"]);
	assert.match(appended?.text ?? "", /read  \[enabled\]/);
	assert.equal(notifications.length, 1);
	assert.equal(notifications[0]?.level, "info");
	assert.match(notifications[0]?.message ?? "", /read  \[enabled\]/);
});
