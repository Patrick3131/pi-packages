import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
	filterPickerItems,
	type PickerItem,
	pickerWindow,
	searchablePicker,
} from "../../src/shared/searchable-picker.js";

const ITEMS: PickerItem[] = [
	{ value: "bash", label: "bash", current: true },
	{ value: "read", label: "read" },
	{ value: "web_search", label: "web_search" },
	{ value: "mcp__notion__search", label: "mcp__notion__search" },
];

const KEYS = { up: "\u001b[A", down: "\u001b[B", confirm: "\r", cancel: "\u001b" };

/** Mounts the picker the way Pi's TUI does: factory now, `done` resolves the promise. */
function tuiHarness() {
	let component: { render: (width: number) => string[]; handleInput: (data: string) => void } | undefined;
	const keybindings = {
		matches: (data: string, binding: string) =>
			(({ "tui.select.up": KEYS.up, "tui.select.down": KEYS.down, "tui.select.confirm": KEYS.confirm, "tui.select.cancel": KEYS.cancel }) as Record<string, string>)[binding] === data,
	};
	const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
	const ctx = {
		mode: "tui",
		hasUI: true,
		ui: {
			custom: (factory: (...args: unknown[]) => unknown) =>
				new Promise((resolve) => {
					component = factory({ requestRender() {} }, theme, keybindings, resolve) as typeof component;
				}),
		},
	} as unknown as ExtensionContext;

	return {
		ctx,
		component: () => {
			assert.ok(component, "the picker component must mount");
			return component;
		},
	};
}

test("an empty query keeps the caller's order and a query matches fuzzily", () => {
	assert.deepEqual(
		filterPickerItems(ITEMS, "").map((item) => item.value),
		["bash", "read", "web_search", "mcp__notion__search"],
	);
	assert.deepEqual(
		filterPickerItems(ITEMS, "ws").map((item) => item.value),
		["web_search"],
	);
	assert.deepEqual(
		filterPickerItems(ITEMS, "notion").map((item) => item.value),
		["mcp__notion__search"],
	);
	assert.deepEqual(filterPickerItems(ITEMS, "zzz"), []);
});


test("a section header is visible but never a search result", () => {
	const items: PickerItem[] = [
		{ value: "read", label: "read", current: true },
		{ value: "section", label: "Indirect tools", kind: "header" },
		{ value: "bash", label: "bash" },
		{ value: "agent_browser_action", label: "agent_browser_action", badge: "deferred", selectable: false },
	];

	assert.deepEqual(filterPickerItems(items, "").map((item) => item.value), ["read", "section", "bash", "agent_browser_action"]);
	assert.deepEqual(filterPickerItems(items, "bash").map((item) => item.value), ["bash"]);
	assert.deepEqual(filterPickerItems(items, "agent").map((item) => item.value), ["agent_browser_action"]);
});

test("the scroll window keeps the selection inside it", () => {
	assert.deepEqual(pickerWindow(4, 0, 10), { start: 0, end: 4 });
	assert.deepEqual(pickerWindow(30, 15, 10), { start: 10, end: 20 });
	assert.deepEqual(pickerWindow(30, 29, 10), { start: 20, end: 30 });
	assert.deepEqual(pickerWindow(0, 0, 10), { start: 0, end: 0 });
});

test("rows fit the terminal and mark the active choice", () => {
	const harness = tuiHarness();
	void searchablePicker(harness.ctx, { title: "Toggle tool", items: ITEMS });

	const lines = harness.component().render(40);
	assert.ok(lines.every((line) => visibleWidth(line) <= 40), "no row may exceed the width");
	assert.match(lines.join("\n"), /bash ✓/);
	assert.match(lines.join("\n"), /→ bash/, "the active row starts selected");
});

test("typing filters and enter resolves the highlighted value", async () => {
	const harness = tuiHarness();
	const pending = searchablePicker(harness.ctx, { title: "Toggle tool", items: ITEMS });

	for (const char of "notion") {
		harness.component().handleInput(char);
	}
	harness.component().handleInput(KEYS.confirm);

	assert.equal(await pending, "mcp__notion__search");
});

test("escape cancels", async () => {
	const harness = tuiHarness();
	const pending = searchablePicker(harness.ctx, { title: "Toggle tool", items: ITEMS });
	harness.component().handleInput(KEYS.cancel);
	assert.equal(await pending, undefined);
});

test("toggle mode activates without closing, and space only toggles on an empty filter", async () => {
	const activated: string[] = [];
	const queries: string[] = [];
	const harness = tuiHarness();
	const pending = searchablePicker(harness.ctx, {
		title: "Tool Configuration",
		items: ITEMS,
		onActivate: (item) => activated.push(item.value),
		onKey: (_data, query) => {
			queries.push(query);
			return false;
		},
	});

	harness.component().handleInput(KEYS.confirm);
	harness.component().handleInput(KEYS.down);
	harness.component().handleInput(KEYS.confirm);
	assert.deepEqual(activated, ["bash", "read"]);

	harness.component().handleInput("w");
	const before = activated.length;
	harness.component().handleInput(" ");
	assert.deepEqual(activated.slice(before), [], "space belongs to the query once it has content");
	// `onKey` sees the query before the key joins it, so a single-letter command can
	// require an empty filter.
	assert.deepEqual(queries, ["", "w"]);

	harness.component().handleInput(KEYS.cancel);
	assert.equal(await pending, undefined);
});

test("navigation skips headers and read-only rows never activate", async () => {
	const activated: string[] = [];
	const items: PickerItem[] = [
		{ value: "read", label: "read", current: true },
		{ value: "section", label: "Indirect tools", kind: "header" },
		{ value: "bash", label: "bash" },
		{ value: "agent_browser_action", label: "agent_browser_action", badge: "deferred", selectable: false },
	];
	const harness = tuiHarness();
	const pending = searchablePicker(harness.ctx, {
		title: "Tool Configuration",
		items,
		onActivate: (item) => activated.push(item.value),
	});

	assert.match(harness.component().render(60).join("\n"), /Indirect tools/);
	assert.match(harness.component().render(60).join("\n"), /→ read/);
	harness.component().handleInput(KEYS.confirm);
	harness.component().handleInput(KEYS.down);
	assert.match(harness.component().render(60).join("\n"), /→ bash/);
	harness.component().handleInput(KEYS.confirm);

	harness.component().handleInput(KEYS.down);
	harness.component().handleInput(KEYS.confirm);
	assert.deepEqual(activated, ["read", "bash"]);

	harness.component().handleInput(KEYS.cancel);
	assert.equal(await pending, undefined);
});

test("a non-TUI host falls back to the plain selector and maps the label back", async () => {
	const asked: string[][] = [];
	const ctx = {
		mode: "rpc",
		hasUI: true,
		ui: {
			select: async (_title: string, labels: string[]) => {
				asked.push(labels);
				return "read";
			},
		},
	} as unknown as ExtensionContext;

	const chosen = await searchablePicker(ctx, {
		title: "Toggle tool",
		items: [
			{ value: "bash", label: "bash" },
			{ value: "read", label: "read" },
		],
	});

	assert.equal(chosen, "read");
	assert.deepEqual(asked, [["bash", "read"]]);
});

test("a non-TUI host only offers activatable labels", async () => {
	const asked: string[][] = [];
	const ctx = {
		mode: "rpc",
		hasUI: true,
		ui: {
			select: async (_title: string, labels: string[]) => {
				asked.push(labels);
				return "read";
			},
		},
	} as unknown as ExtensionContext;

	const chosen = await searchablePicker(ctx, {
		title: "Toggle tool",
		items: [
			{ value: "section", label: "Indirect tools", kind: "header" },
			{ value: "read", label: "read" },
			{ value: "agent_browser_action", label: "agent_browser_action", selectable: false },
		],
	});

	assert.equal(chosen, "read");
	assert.deepEqual(asked, [["read"]]);
});
