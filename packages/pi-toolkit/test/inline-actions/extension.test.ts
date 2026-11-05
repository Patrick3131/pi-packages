import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtensionAPI, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

import inlineActionsExtension from "../../src/features/inline-actions/index.js";
import { setPresetRuntime } from "../../src/features/presets/registry.js";

type InputHandler = (event: InputEvent, ctx: unknown) => Promise<InputEventResult> | InputEventResult;
type SessionHandler = (event: unknown, ctx: unknown) => Promise<void> | void;

interface HarnessOptions {
	hasUI?: boolean;
	hasCredentials?: boolean;
	select?: (title: string, options: string[]) => Promise<string | undefined>;
}

const MODELS = [
	{ provider: "anthropic", id: "claude-opus-4-5", name: "Opus" },
	{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Sonnet" },
];

const TOOLS = ["bash", "read", "web_search"];

/** Minimal stand-in for the pi API: tools, model registry, input event, UI. */
function harness(options: HarnessOptions = {}) {
	let inputHandler: InputHandler | undefined;
	let sessionStartHandler: SessionHandler | undefined;
	let shutdownHandler: SessionHandler | undefined;
	let autocompleteFactory: ((current: AutocompleteProvider) => AutocompleteProvider) | undefined;

	const notifications: { message: string; level: string }[] = [];
	const applied: { model?: string; thinking?: string } = {};
	const selections: string[] = [];
	let activeTools = ["read", "bash"];

	const pi = {
		on: (event: string, handler: never) => {
			if (event === "input") inputHandler = handler as unknown as InputHandler;
			if (event === "session_start") sessionStartHandler = handler as unknown as SessionHandler;
			if (event === "session_shutdown") shutdownHandler = handler as unknown as SessionHandler;
		},
		getAllTools: () => TOOLS.map((name) => ({ name })),
		getActiveTools: () => [...activeTools],
		setActiveTools: (names: string[]) => {
			activeTools = [...names];
		},
		setThinkingLevel: (level: string) => {
			applied.thinking = level;
		},
		setModel: async (model: { provider: string; id: string }) => {
			if (options.hasCredentials === false) return false;
			applied.model = `${model.provider}/${model.id}`;
			return true;
		},
		getCommands: () => [],
	} as unknown as ExtensionAPI;

	const ctx = {
		hasUI: options.hasUI ?? true,
		ui: {
			notify: (message: string, level = "info") => notifications.push({ message, level }),
			select: async (title: string, items: string[]) => {
				selections.push(title);
				return options.select ? options.select(title, items) : undefined;
			},
			addAutocompleteProvider: (factory: typeof autocompleteFactory) => {
				autocompleteFactory = factory;
			},
		},
		modelRegistry: {
			find: (provider: string, id: string) => MODELS.find((model) => model.provider === provider && model.id === id),
			getAvailable: () => MODELS,
		},
		scopedModels: [],
	};

	inlineActionsExtension(pi);
	assert.ok(inputHandler, "extension must register an input handler");

	return {
		input: (text: string, extra: Partial<InputEvent> = {}) =>
			inputHandler!({ type: "input", text, source: "interactive", ...extra }, ctx) as Promise<InputEventResult>,
		/** The provider as the editor would see it, stacked on a `current` stub. */
		provider: (current: AutocompleteProvider) => {
			assert.ok(sessionStartHandler, "extension must register a session_start handler");
			sessionStartHandler({ type: "session_start" }, ctx);
			assert.ok(autocompleteFactory, "session_start must add an autocomplete provider");
			return autocompleteFactory(current);
		},
		shutdown: () => shutdownHandler?.({ type: "session_shutdown" }, ctx),
		notifications,
		applied,
		selections,
		activeTools: () => activeTools,
	};
}

/** A provider that always answers, so delegation is visible. */
function stubProvider(items: { value: string; label: string }[] = [], prefix = "@builtin"): AutocompleteProvider {
	return {
		async getSuggestions() {
			return { prefix, items };
		},
		applyCompletion(lines, cursorLine, _cursorCol, item) {
			const newLines = [...lines];
			newLines[cursorLine] = item.value;
			return { lines: newLines, cursorLine, cursorCol: item.value.length };
		},
		shouldTriggerFileCompletion: () => true,
	};
}

const SIGNAL = { signal: new AbortController().signal };

test("a model directive applies and is stripped from the prompt", async () => {
	const { input, applied, notifications } = harness();
	const result = await input("please $model:anthropic/claude-opus-4-5 then continue");

	assert.deepEqual(result, { action: "transform", text: "please  then continue" });
	assert.equal(applied.model, "anthropic/claude-opus-4-5");
	assert.deepEqual(notifications, [{ message: "model → anthropic/claude-opus-4-5", level: "info" }]);
});

test("a bare model id round-trips through the catalogue", async () => {
	const { input, applied } = harness();
	await input("$model:claude-sonnet-4-5");
	assert.equal(applied.model, "anthropic/claude-sonnet-4-5");
});

test("a directive-only prompt is handled instead of sent", async () => {
	const { input, applied } = harness();
	assert.deepEqual(await input("$thinking:high"), { action: "handled" });
	assert.equal(applied.thinking, "high");
});

test("the colon is required, so a bare mention is never consumed", async () => {
	const { input, notifications } = harness();
	assert.deepEqual(await input("the $model value here"), { action: "continue" });
	assert.deepEqual(notifications, []);
});

test("text without a dollar sign is ignored cheaply", async () => {
	const { input } = harness();
	assert.deepEqual(await input("/model opus"), { action: "continue" });
});

test("an escaped directive stays literal in the prompt", async () => {
	const { input, applied, notifications } = harness();
	const result = await input("explain \\$model:claude-opus-4-5 first");

	assert.deepEqual(result, { action: "transform", text: "explain $model:claude-opus-4-5 first" });
	assert.equal(applied.model, undefined);
	assert.deepEqual(notifications, []);
});

test("a mixed message applies the active directive and unescapes the literal one", async () => {
	const { input, applied } = harness();
	const result = await input("\\$model:claude-opus-4-5 is syntax, $thinking:high");

	assert.deepEqual(result, { action: "transform", text: "$model:claude-opus-4-5 is syntax, " });
	assert.equal(applied.model, undefined);
	assert.equal(applied.thinking, "high");
});

test("extension-sourced input is never rewritten", async () => {
	const { input, notifications } = harness();
	assert.deepEqual(await input("$model:claude-opus-4-5", { source: "extension" }), { action: "continue" });
	assert.deepEqual(notifications, []);
});

test("an unknown model is reported and still removed from the prompt", async () => {
	const { input, notifications, applied } = harness();
	const result = await input("$model:nope");

	assert.deepEqual(result, { action: "handled" });
	assert.equal(applied.model, undefined);
	assert.deepEqual(notifications, [{ message: 'unknown model "nope"', level: "warning" }]);
});

test("a model without credentials reports the provider and model", async () => {
	const { input, notifications } = harness({ hasCredentials: false });
	await input("$model:claude-opus-4-5");
	assert.deepEqual(notifications, [{ message: "no credentials for anthropic/claude-opus-4-5", level: "warning" }]);
});

test("tool directives add and remove around the current set", async () => {
	const { input, activeTools, notifications } = harness();
	await input("$tools:+web_search,-bash");
	assert.deepEqual(activeTools(), ["read", "web_search"]);
	assert.deepEqual(notifications, [{ message: "tools +web_search -bash", level: "info" }]);
});

test("an unknown tool leaves the active set untouched", async () => {
	const { input, activeTools, notifications } = harness();
	await input("$tools:+bash,-nope");
	assert.deepEqual(activeTools(), ["read", "bash"]);
	assert.deepEqual(notifications, [{ message: "unknown tool: nope", level: "warning" }]);
});

test("an empty thinking argument without UI reports the levels", async () => {
	const { input, notifications } = harness({ hasUI: false });
	assert.deepEqual(await input("$thinking:"), { action: "handled" });
	assert.equal(notifications[0]?.level, "warning");
	assert.ok(notifications[0]?.message.includes("minimal"));
});

test("a picker only opens when the session is idle and dialog-capable", async () => {
	const userPick = (choice: string) => async () => choice;

	const idle = harness({ select: userPick("anthropic/claude-opus-4-5") });
	assert.deepEqual(await idle.input("$model:"), { action: "handled" });
	assert.deepEqual(idle.selections, ["Model for this session"]);
	assert.equal(idle.applied.model, "anthropic/claude-opus-4-5");

	const streaming = harness({ select: userPick("anthropic/claude-opus-4-5") });
	await streaming.input("$model:", { streamingBehavior: "steer" });
	assert.deepEqual(streaming.selections, []);
	assert.equal(streaming.notifications[0]?.level, "warning");

	const headless = harness({ hasUI: false, select: userPick("anthropic/claude-opus-4-5") });
	await headless.input("$model:");
	assert.deepEqual(headless.selections, []);
});

test("cancelling a picker keeps the tool set and reports it", async () => {
	const { input, notifications, activeTools } = harness({ select: async () => undefined });
	await input("$tools:");
	assert.deepEqual(activeTools(), ["read", "bash"]);
	assert.deepEqual(notifications, [{ message: "$tools: cancelled", level: "warning" }]);
});

test("the tool picker toggles exactly the chosen tool", async () => {
	const { input, activeTools } = harness({ select: async (_title, items) => items[0] });
	await input("$tools:");
	// Sorted labels are ✓ bash, ✓ read, · web_search.
	assert.deepEqual(activeTools(), ["read"]);
});

test("several directives in one prompt all apply, in order", async () => {
	const { input, applied, activeTools } = harness();
	const result = await input("$model:claude-opus-4-5 $thinking:max $tools:+web_search do it");

	assert.deepEqual(result, { action: "transform", text: "   do it" });
	assert.equal(applied.model, "anthropic/claude-opus-4-5");
	assert.equal(applied.thinking, "max");
	assert.deepEqual(activeTools(), ["read", "bash", "web_search"]);
});

test("skill mentions are untouched by the action handler", async () => {
	const { input } = harness();
	assert.deepEqual(await input("$nabu-docs"), { action: "continue" });
});

test("a preset directive applies through the presets bridge", async () => {
	const calls: string[] = [];
	setPresetRuntime({
		names: () => ["plan", "implement"],
		apply: async (name) => {
			calls.push(name);
			return true;
		},
	});
	try {
		const { input, notifications } = harness();
		assert.deepEqual(await input("$preset:plan"), { action: "handled" });
		assert.deepEqual(calls, ["plan"]);
		assert.deepEqual(notifications, [{ message: "preset → plan", level: "info" }]);
	} finally {
		setPresetRuntime(undefined);
	}
});

test("an unknown preset lists what is available", async () => {
	setPresetRuntime({ names: () => ["plan"], apply: async () => true });
	try {
		const { input, notifications } = harness();
		await input("$preset:nope");
		assert.deepEqual(notifications, [
			{ message: 'unknown preset "nope" (available: plan)', level: "warning" },
		]);
	} finally {
		setPresetRuntime(undefined);
	}
});

test("a preset directive without the presets feature fails open", async () => {
	const { input, notifications } = harness();
	await input("$preset:plan");
	assert.deepEqual(notifications, [{ message: "the presets feature is not loaded", level: "warning" }]);
});

test("the shutdown handler releases the session context", () => {
	const { shutdown } = harness();
	assert.doesNotThrow(() => shutdown());
});

test("a bare $ lists the actions ahead of the stacked skills", async () => {
	const { provider } = harness();
	const stacked = provider(stubProvider([{ value: "$alpha", label: "$alpha" }], "$"));

	const result = await stacked.getSuggestions(["$"], 0, "$".length, SIGNAL);
	assert.deepEqual(result?.items.map((item) => item.value), [
		"$model:",
		"$thinking:",
		"$tools:",
		"$preset:",
		"$alpha",
	]);
	assert.equal(result?.prefix, "$");
});

test("an action fragment answers even when the stacked provider has nothing", async () => {
	const { provider } = harness();
	const stacked = provider(stubProvider([]));

	const result = await stacked.getSuggestions(["use $mo"], 0, "use $mo".length, SIGNAL);
	assert.deepEqual(result?.items.map((item) => item.value), ["$model:"]);
});

test("a colon token lists its arguments from live session state", async () => {
	const { provider } = harness();
	const stacked = provider(stubProvider([]));

	const models = await stacked.getSuggestions(["$model:"], 0, "$model:".length, SIGNAL);
	assert.deepEqual(models?.items.map((item) => item.value), [
		"$model:anthropic/claude-opus-4-5",
		"$model:anthropic/claude-sonnet-4-5",
	]);

	const tools = await stacked.getSuggestions(["$tools:+re"], 0, "$tools:+re".length, SIGNAL);
	assert.deepEqual(tools?.items.map((item) => item.value), ["$tools:+read"]);
});

test("everything that is not a token falls through untouched", async () => {
	const { provider } = harness();
	const stacked = provider(stubProvider());

	for (const line of ["@src/index.ts", "/model opus", "$HOME"]) {
		const result = await stacked.getSuggestions([line], 0, line.length, SIGNAL);
		assert.equal(result?.prefix, "@builtin", line);
	}
});

test("completion owns directive tokens and delegates the rest", async () => {
	const { provider } = harness();
	const stacked = provider(stubProvider());

	const directive = stacked.applyCompletion(["$mo now"], 0, "$mo".length, { value: "$model:", label: "$model:" }, "$mo");
	assert.deepEqual(directive.lines, ["$model: now"]);
	assert.equal(directive.cursorCol, "$model:".length);

	const foreign = stacked.applyCompletion(["@src"], 0, "@src".length, { value: "@src/index.ts", label: "" }, "@src");
	assert.deepEqual(foreign.lines, ["@src/index.ts"]);
});

test("file completion triggering is delegated", () => {
	const { provider } = harness();
	assert.equal(provider(stubProvider()).shouldTriggerFileCompletion?.(["a"], 0, 1), true);
});
