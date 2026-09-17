import assert from "node:assert/strict";
import { test } from "node:test";

import {
	applyMentionCompletion,
	isMentionToken,
	mentionFragment,
	mentionTokenBeforeCursor,
	skillSuggestionItems,
	type SuggestionSkill,
} from "../src/autocomplete.js";

const SKILLS: SuggestionSkill[] = [
	{ name: "alpha", description: "Do alpha things." },
	{ name: "beta-tools", description: "Do beta things." },
	{ name: "plan-and-implement-runner", description: "Plan, then implement." },
];

test("a bare $ token completes the full list", () => {
	assert.equal(mentionTokenBeforeCursor("$"), "$");
	assert.deepEqual(
		skillSuggestionItems({ token: "$", skills: SKILLS }).map((item) => item.value),
		["$alpha", "$beta-tools", "$plan-and-implement-runner"],
	);
});

test("a typed fragment filters and keeps the typed lead spelling", () => {
	assert.equal(mentionTokenBeforeCursor("use $be"), "$be");
	assert.deepEqual(
		skillSuggestionItems({ token: "$be", skills: SKILLS }).map((item) => item.value),
		["$beta-tools"],
	);
	assert.deepEqual(
		skillSuggestionItems({ token: "/skill:alp", skills: SKILLS }).map((item) => item.value),
		["/skill:alpha"],
	);
});

test("prefix matches rank above mid-name matches", () => {
	const skills: SuggestionSkill[] = [{ name: "pre-tools" }, { name: "tools" }];
	assert.deepEqual(
		skillSuggestionItems({ token: "$tools", skills }).map((item) => item.value),
		["$tools", "$pre-tools"],
	);
});

test("descriptions are single-line and truncated", () => {
	const [item] = skillSuggestionItems({
		token: "$",
		skills: [{ name: "long", description: `${"word ".repeat(40)}end` }],
	});
	assert.ok(item.description);
	assert.ok(item.description.length <= 90);
	assert.ok(!item.description.includes("\n"));
});

test("a skill without a description yields an item without one", () => {
	const [item] = skillSuggestionItems({ token: "$", skills: [{ name: "bare" }] });
	assert.deepEqual(item, { value: "$bare", label: "$bare", description: undefined });
});

test("the item cap is honoured", () => {
	const many: SuggestionSkill[] = Array.from({ length: 5 }, (_, index) => ({ name: `s${index}` }));
	assert.equal(skillSuggestionItems({ token: "$", skills: many, max: 2 }).length, 2);
});

test("an unknown fragment yields no items", () => {
	assert.deepEqual(skillSuggestionItems({ token: "$nope", skills: SKILLS }), []);
});

test("a $ token is only recognised at a token boundary", () => {
	assert.equal(mentionTokenBeforeCursor("$"), "$");
	assert.equal(mentionTokenBeforeCursor("use $"), "$");
	assert.equal(mentionTokenBeforeCursor("use\t$pl"), "$pl");
	assert.equal(mentionTokenBeforeCursor('use "$pl'), "$pl");
	assert.equal(mentionTokenBeforeCursor("x=$pl"), "$pl");
	assert.equal(mentionTokenBeforeCursor("foo$bar"), undefined);
	assert.equal(mentionTokenBeforeCursor("costs $5"), undefined);
});

test("shell text never looks like a mention token", () => {
	for (const text of ["echo $HOME", "echo $1", "cd $(pwd)", "echo ${VAR}"]) {
		assert.equal(mentionTokenBeforeCursor(text), undefined, text);
	}
});

test("the @ attachment spelling is no longer ours", () => {
	for (const text of ["@skill", "@skill:alpha", "@src/index.ts"]) {
		assert.equal(mentionTokenBeforeCursor(text), undefined, text);
	}
});

test("a mid-message /skill: token completes but a leading one does not", () => {
	assert.equal(mentionTokenBeforeCursor("then /skill:beta"), "/skill:beta");
	assert.equal(mentionTokenBeforeCursor("/skill:beta"), undefined);
	assert.equal(mentionTokenBeforeCursor("see /skill now"), undefined);
});

test("isMentionToken accepts provider prefixes only", () => {
	assert.ok(isMentionToken("$"));
	assert.ok(isMentionToken("$alpha"));
	assert.ok(isMentionToken("/skill:beta-tools"));
	assert.ok(!isMentionToken("$Alpha"));
	assert.ok(!isMentionToken("@skill"));
	assert.ok(!isMentionToken("@src/index.ts"));
	assert.ok(!isMentionToken("#12"));
});

test("mentionFragment reads the part after the symbol", () => {
	assert.equal(mentionFragment("$"), "");
	assert.equal(mentionFragment("$alpha"), "alpha");
	assert.equal(mentionFragment("/skill:beta-tools"), "beta-tools");
});

test("applyMentionCompletion replaces only the token and keeps the sentence", () => {
	const result = applyMentionCompletion({
		lines: ["use $al and continue"],
		cursorLine: 0,
		cursorCol: "use $al".length,
		value: "$alpha",
		prefix: "$al",
	});
	assert.deepEqual(result.lines, ["use $alpha and continue"]);
	assert.equal(result.cursorCol, "use $alpha".length);
});

test("applyMentionCompletion does not append a trailing space", () => {
	const result = applyMentionCompletion({
		lines: ["$"],
		cursorLine: 0,
		cursorCol: 1,
		value: "$alpha",
		prefix: "$",
	});
	assert.deepEqual(result.lines, ["$alpha"]);
});

test("applyMentionCompletion replaces a mid-message /skill: token", () => {
	const result = applyMentionCompletion({
		lines: ["compare /skill:be now"],
		cursorLine: 0,
		cursorCol: "compare /skill:be".length,
		value: "/skill:beta-tools",
		prefix: "/skill:be",
	});
	assert.deepEqual(result.lines, ["compare /skill:beta-tools now"]);
});
