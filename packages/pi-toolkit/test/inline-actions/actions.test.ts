import assert from "node:assert/strict";
import { test } from "node:test";

import {
	actionArgSuggestionItems,
	actionSuggestionItems,
	actionTokenBeforeCursor,
	applyTokenCompletion,
	bareActionName,
	type ActionSources,
	formatToolChanges,
	isActionName,
	isActionValue,
	parseDirectives,
	parseToolChanges,
	rewriteDirectives,
} from "../../src/features/inline-actions/actions.js";

const SOURCES: ActionSources = {
	models: [
		{ provider: "anthropic", id: "claude-opus-4-5" },
		{ provider: "anthropic", id: "claude-sonnet-4-5" },
		{ provider: "opencode", id: "deepseek-v4" },
	],
	tools: [
		{ name: "read", active: true },
		{ name: "bash", active: true, description: "Run a command" },
		{ name: "web_search", active: false },
	],
	presets: ["plan", "implement"],
};

test("a bare token carries no argument", () => {
	assert.deepEqual(actionTokenBeforeCursor("use $mo"), { fragment: "mo", arg: undefined, token: "$mo" });
});

test("a colon opens the argument form, empty included", () => {
	assert.deepEqual(actionTokenBeforeCursor("$model:"), { fragment: "model", arg: "", token: "$model:" });
	assert.deepEqual(actionTokenBeforeCursor("x $model:ant/op"), {
		fragment: "model",
		arg: "ant/op",
		token: "$model:ant/op",
	});
});

test("only token-boundary, lowercase, letter-leading tokens are ours", () => {
	assert.equal(actionTokenBeforeCursor("$HOME"), undefined);
	assert.equal(actionTokenBeforeCursor("$1"), undefined);
	assert.equal(actionTokenBeforeCursor("costs$5"), undefined);
	assert.equal(actionTokenBeforeCursor("@src/foo"), undefined);
});

test("a directive parses its name, argument and offsets", () => {
	const text = "go $model:anthropic/claude-opus-4-5 now";
	const [directive] = parseDirectives(text);
	assert.deepEqual(directive, {
		name: "model",
		arg: "anthropic/claude-opus-4-5",
		start: 3,
		end: 3 + "$model:anthropic/claude-opus-4-5".length,
		escaped: false,
	});
});

test("a directive never swallows prose punctuation", () => {
	const [directive] = parseDirectives("$model:opus. then continue");
	assert.equal(directive?.arg, "opus");
	assert.equal(directive?.end, "$model:opus".length);
});

test("tool lists survive as one directive argument", () => {
	const [directive] = parseDirectives("$tools:+web_search,-bash now");
	assert.equal(directive?.arg, "+web_search,-bash");
});

test("the colon is required, so a bare mention stays a skill token", () => {
	assert.deepEqual(parseDirectives("$model"), []);
	assert.deepEqual(parseDirectives("$models:opus"), []);
	assert.deepEqual(parseDirectives("$files and $target"), []);
});

test("an escaped directive is marked, and loses only its backslash", () => {
	const text = "explain \\$model:opus first";
	const [directive] = parseDirectives(text);
	assert.equal(directive?.escaped, true);
	assert.equal(rewriteDirectives(text, [directive!]), "explain $model:opus first");
});

test("removal preserves every other byte", () => {
	const text = "before $model:opus middle $thinking:high after";
	const kept = parseDirectives(text).filter((directive) => directive.name === "model");
	assert.equal(rewriteDirectives(text, kept), "before  middle $thinking:high after");
});

test("removing all directives can leave nothing", () => {
	const text = "$model:opus";
	assert.equal(rewriteDirectives(text, parseDirectives(text)), "");
});

test("tool changes accept signed and bare names", () => {
	assert.deepEqual(parseToolChanges("+web_search,-bash,read"), [
		{ sign: "+", name: "web_search" },
		{ sign: "-", name: "bash" },
		{ sign: "+", name: "read" },
	]);
	assert.deepEqual(parseToolChanges("-"), []);
	assert.deepEqual(parseToolChanges(","), []);
	assert.equal(formatToolChanges(parseToolChanges("+a,-b")), "+a -b");
});

test("action names and values are recognised exactly", () => {
	assert.equal(isActionName("model"), true);
	assert.equal(isActionName("thinking"), true);
	assert.equal(isActionName("models"), false);
	assert.equal(isActionValue("$tools:"), true);
	assert.equal(isActionValue("$model"), false);
	assert.equal(isActionValue("$files:"), false);
});

test("only a bare action entry asks for an argument of its own", () => {
	assert.equal(bareActionName("$model:"), "model");
	assert.equal(bareActionName("$tools:"), "tools");
	assert.equal(bareActionName("$model:opus"), undefined);
	assert.equal(bareActionName("$files:"), undefined);
	assert.equal(bareActionName("$MODEL:"), undefined);
});

test("a bare $ offers every action, colon included", () => {
	assert.deepEqual(
		actionSuggestionItems("").map((item) => item.value),
		["$model:", "$thinking:", "$tools:", "$preset:"],
	);
	assert.ok(actionSuggestionItems("")[0]?.description?.includes("Switch the model"));
});

test("an action fragment narrows the list", () => {
	assert.deepEqual(actionSuggestionItems("mo").map((item) => item.value), ["$model:"]);
	assert.deepEqual(actionSuggestionItems("t").map((item) => item.value), ["$thinking:", "$tools:"]);
	assert.deepEqual(actionSuggestionItems("zzz"), []);
});

test("models complete as provider/id and carry the whole token", () => {
	const items = actionArgSuggestionItems({ fragment: "model", arg: "sonnet", token: "$model:sonnet" }, SOURCES);
	assert.deepEqual(items, [{ value: "$model:anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5" }]);
});

test("an empty model argument lists everything available", () => {
	const items = actionArgSuggestionItems({ fragment: "model", arg: "", token: "$model:" }, SOURCES);
	assert.equal(items.length, SOURCES.models.length);
});

test("thinking levels complete", () => {
	assert.deepEqual(
		actionArgSuggestionItems({ fragment: "thinking", arg: "h", token: "$thinking:h" }, SOURCES).map(
			(item) => item.value,
		),
		["$thinking:high"],
	);
});

test("preset names complete", () => {
	assert.deepEqual(
		actionArgSuggestionItems({ fragment: "preset", arg: "", token: "$preset:" }, SOURCES).map(
			(item) => item.value,
		),
		["$preset:plan", "$preset:implement"],
	);
});

test("enabling a tool extends the comma list instead of replacing it", () => {
	const items = actionArgSuggestionItems({ fragment: "tools", arg: "+read,+we", token: "$tools:+read,+we" }, SOURCES);
	assert.deepEqual(items.map((item) => item.value), ["$tools:+read,+web_search"]);
	assert.deepEqual(items.map((item) => item.label), ["+web_search"]);
});

test("disabling only offers tools that are currently active", () => {
	const items = actionArgSuggestionItems({ fragment: "tools", arg: "-", token: "$tools:-" }, SOURCES);
	assert.deepEqual(items.map((item) => item.value), ["$tools:-bash", "$tools:-read"]);
});

test("a non-action colon token belongs to someone else", () => {
	assert.deepEqual(actionArgSuggestionItems({ fragment: "skill", arg: "x", token: "$skill:x" }, SOURCES), []);
});

test("completion replaces only the token before the cursor", () => {
	const applied = applyTokenCompletion({
		lines: ["please $mo now"],
		cursorLine: 0,
		cursorCol: "please $mo".length,
		value: "$model:",
		prefix: "$mo",
	});
	assert.deepEqual(applied.lines, ["please $model: now"]);
	assert.equal(applied.cursorCol, "please $model:".length);
});
