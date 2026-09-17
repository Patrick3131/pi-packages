import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ExtensionAPI, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

import skillMentionsExtension from "../src/index.js";

type InputHandler = (event: InputEvent, ctx: unknown) => InputEventResult;
type SessionStartHandler = (event: unknown, ctx: unknown) => void;
type Command = { description?: string; handler: (args: string, ctx: unknown) => Promise<void> };

/** Minimal stand-in for the pi API: the command list, the input event, the UI. */
function harness(commands: ReturnType<ExtensionAPI["getCommands"]>) {
	let inputHandler: InputHandler | undefined;
	let sessionStartHandler: SessionStartHandler | undefined;
	const registered = new Map<string, Command>();
	const notifications: string[] = [];
	const notificationsWithLevel: { message: string; level: string }[] = [];
	let autocompleteFactory: ((current: AutocompleteProvider) => AutocompleteProvider) | undefined;

	const pi = {
		getCommands: () => commands,
		on: (event: string, next: never) => {
			if (event === "input") {
				inputHandler = next as unknown as InputHandler;
			}
			if (event === "session_start") {
				sessionStartHandler = next as unknown as SessionStartHandler;
			}
		},
		registerCommand: (name: string, options: Command) => registered.set(name, options),
	} as unknown as ExtensionAPI;

	const ctx = {
		ui: {
			notify: (message: string, level = "info") => {
				notifications.push(message);
				notificationsWithLevel.push({ message, level });
			},
			addAutocompleteProvider: (factory: typeof autocompleteFactory) => {
				autocompleteFactory = factory;
			},
		},
	};

	skillMentionsExtension(pi);
	assert.ok(inputHandler, "extension must register an input handler");

	return {
		input: (text: string, source: InputEvent["source"] = "interactive") =>
			inputHandler!({ type: "input", text, source }, ctx),
		/** The provider as the editor would see it, stacked on a `current` stub. */
		provider: (current: AutocompleteProvider) => {
			assert.ok(sessionStartHandler, "extension must register a session_start handler");
			sessionStartHandler({ type: "session_start" }, ctx);
			assert.ok(autocompleteFactory, "session_start must add an autocomplete provider");
			return autocompleteFactory(current);
		},
		command: (name: string) => {
			const command = registered.get(name);
			assert.ok(command, `expected a /${name} command`);
			return command;
		},
		notifications,
		notificationsWithLevel,
	};
}

function skillCommand(name: string, path: string, baseDir?: string, description?: string) {
	return {
		name: `skill:${name}`,
		description,
		source: "skill" as const,
		sourceInfo: { path, source: "test", scope: "user" as const, origin: "package" as const, baseDir },
	};
}

function writeSkill(name: string, body: string): { dir: string; file: string } {
	const dir = mkdtempSync(join(tmpdir(), "pi-skill-mentions-"));
	mkdirSync(dir, { recursive: true });
	const file = join(dir, "SKILL.md");
	writeFileSync(file, `---\nname: ${name}\n---\n\n${body}\n`, "utf8");
	return { dir, file };
}

/** A provider that always reports the call as a fallback, so delegation is visible. */
function fallbackProvider(calls: string[]): AutocompleteProvider {
	return {
		async getSuggestions(_lines, _cursorLine, _cursorCol, _options) {
			calls.push("getSuggestions");
			return { prefix: "@builtin", items: [{ value: "@builtin", label: "@builtin" }] };
		},
		applyCompletion(lines, cursorLine, cursorCol, item, _prefix) {
			calls.push("applyCompletion");
			const newLines = [...lines];
			newLines[cursorLine] = item.value;
			return { lines: newLines, cursorLine, cursorCol: item.value.length };
		},
		shouldTriggerFileCompletion() {
			calls.push("shouldTriggerFileCompletion");
			return true;
		},
	};
}

const SIGNAL = { signal: new AbortController().signal };

test("input rewrites a mention using the loaded SKILL.md", () => {
	const { dir, file } = writeSkill("alpha", "# Alpha\n\nDo alpha.");
	const { input } = harness([skillCommand("alpha", file, dir)]);
	const result = input("Please $alpha now.");

	assert.equal(result.action, "transform");
	const text = result.action === "transform" ? result.text : "";
	assert.ok(text.includes(`<skill name="alpha" location="${file}">`));
	assert.ok(text.includes(`References are relative to ${dir}.`));
	assert.ok(text.includes("Do alpha."));
	assert.ok(!text.includes("name: alpha"));
	assert.ok(text.startsWith("Please ") && text.endsWith(" now."));
});

test("baseDir falls back to the SKILL.md directory", () => {
	const { dir, file } = writeSkill("alpha", "body");
	const { input } = harness([skillCommand("alpha", file)]);
	const result = input("$alpha");
	const text = result.action === "transform" ? result.text : "";
	assert.ok(text.includes(`References are relative to ${dir}.`));
});

test("input is left alone when nothing can be expanded", () => {
	const { input, notifications } = harness([]);
	assert.deepEqual(input("no mentions here"), { action: "continue" });
	assert.deepEqual(notifications, [] as string[]);

	assert.deepEqual(input("please use /skill:missing"), { action: "continue" });
	assert.equal(notifications.length, 1);
	const [warning] = notifications;
	assert.ok(warning.includes("/skill:missing"));
	assert.ok(warning.includes("Loaded skills: none"));
});

test("an unknown mention does not block a known one in the same message", () => {
	const { file, dir } = writeSkill("alpha", "body");
	const { input, notifications } = harness([skillCommand("alpha", file, dir)]);
	const result = input("$missing then $alpha");

	assert.equal(result.action, "transform");
	assert.deepEqual(notifications, [] as string[], "an unresolved $name stays quiet");
});

test("extension-injected messages are never rewritten", () => {
	const { file, dir } = writeSkill("alpha", "body");
	const { input, notifications } = harness([skillCommand("alpha", file, dir)]);
	assert.deepEqual(input("$alpha", "extension"), { action: "continue" });
	assert.deepEqual(notifications, [] as string[]);
});

test("commands from other sources are ignored when building the skill index", () => {
	const { file, dir } = writeSkill("alpha", "body");
	const promptCommand = { ...skillCommand("alpha", file, dir), source: "prompt" as const };
	const extensionCommand = { ...skillCommand("alpha", file, dir), source: "extension" as const };
	const { input } = harness([promptCommand, extensionCommand]);
	assert.deepEqual(input("$alpha"), { action: "continue" });
});

test("autocomplete offers loaded skills for a mention token", async () => {
	const skills = [
		skillCommand("alpha", "/s/alpha/SKILL.md", "/s/alpha", "Do alpha things."),
		skillCommand("beta-tools", "/s/beta/SKILL.md", "/s/beta", "Do beta things."),
	];
	const { provider } = harness(skills);
	const calls: string[] = [];
	const stacked = provider(fallbackProvider(calls));

	const result = await stacked.getSuggestions(["use $be"], 0, "use $be".length, SIGNAL);
	assert.deepEqual(calls, []);
	assert.equal(result?.prefix, "$be");
	assert.deepEqual(
		result?.items.map((item) => [item.value, item.description]),
		[["$beta-tools", "Do beta things."]],
	);
});

test("autocomplete lists every skill for a bare $ token", async () => {
	const { provider } = harness([
		skillCommand("alpha", "/s/alpha/SKILL.md", "/s/alpha"),
		skillCommand("beta", "/s/beta/SKILL.md", "/s/beta"),
	]);
	const stacked = provider(fallbackProvider([]));
	const result = await stacked.getSuggestions(["$"], 0, "$".length, SIGNAL);
	assert.deepEqual(result?.items.map((item) => item.value), ["$alpha", "$beta"]);
});

test("autocomplete delegates everything that is not a mention token", async () => {
	const { provider } = harness([skillCommand("alpha", "/s/alpha/SKILL.md", "/s/alpha")]);
	const calls: string[] = [];
	const stacked = provider(fallbackProvider(calls));

	for (const line of ["@src/index.ts", "plain text", "$HOME"]) {
		const result = await stacked.getSuggestions([line], 0, line.length, SIGNAL);
		assert.equal(result?.prefix, "@builtin", line);
	}
	assert.deepEqual(calls, ["getSuggestions", "getSuggestions", "getSuggestions"]);
});

test("an unmatched token is left to other providers", async () => {
	const { provider } = harness([skillCommand("alpha", "/s/alpha/SKILL.md", "/s/alpha")]);
	const calls: string[] = [];
	const stacked = provider(fallbackProvider(calls));

	const result = await stacked.getSuggestions(["$nope"], 0, "$nope".length, SIGNAL);
	assert.equal(result?.prefix, "@builtin");
	assert.deepEqual(calls, ["getSuggestions"], "an unmatched token falls through");
});

test("completion replaces a mention token without adding a space", () => {
	const { provider } = harness([]);
	const calls: string[] = [];
	const stacked = provider(fallbackProvider(calls));

	const applied = stacked.applyCompletion(["use $be now"], 0, "use $be".length, {
		value: "$beta-tools",
		label: "$beta-tools",
	}, "$be");
	assert.deepEqual(applied.lines, ["use $beta-tools now"]);
	assert.equal(applied.cursorCol, "use $beta-tools".length);
	assert.deepEqual(calls, []);
});

test("completion delegates prefixes this extension does not own", () => {
	const { provider } = harness([]);
	const calls: string[] = [];
	const stacked = provider(fallbackProvider(calls));

	stacked.applyCompletion(["@src/index.ts"], 0, "@src/index.ts".length, {
		value: "@src/index.ts",
		label: "@src/index.ts",
	}, "@src");
	assert.deepEqual(calls, ["applyCompletion"]);
});

test("file-completion triggering is left to the built-in provider", () => {
	const { provider } = harness([]);
	const calls: string[] = [];
	const stacked = provider(fallbackProvider(calls));
	assert.equal(stacked.shouldTriggerFileCompletion?.(["$al"], 0, 3), true);
	assert.deepEqual(calls, ["shouldTriggerFileCompletion"]);
});

test("/skill-mentions lists the loaded skills", async () => {
	const { provider, command, notifications } = harness([
		skillCommand("beta", "/s/beta/SKILL.md", "/s/beta", "Do beta things."),
		skillCommand("alpha", "/s/alpha/SKILL.md", "/s/alpha"),
	]);
	provider(fallbackProvider([])); // registers the provider, as a real session would

	await command("skill-mentions").handler("", { ui: { notify: (message: string) => notifications.push(message) } });
	assert.equal(notifications.length, 1);
	const [listing] = notifications;
	assert.ok(listing.startsWith("2 skill(s) available:"));
	assert.ok(listing.includes("• $alpha"));
	assert.ok(listing.includes("• $beta — Do beta things."));
	assert.ok(listing.indexOf("$alpha") < listing.indexOf("$beta"), "sorted by name");
});

test("/skill-mentions reports an empty session", async () => {
	const { provider, command, notifications } = harness([]);
	provider(fallbackProvider([]));
	await command("skill-mentions").handler("", { ui: { notify: (message: string) => notifications.push(message) } });
	assert.deepEqual(notifications, ["No skills are loaded in this session."]);
});
