import assert from "node:assert/strict";
import test from "node:test";

import {
	firstLine,
	formatParameters,
	formatSource,
	formatToolDetails,
	formatToolSummary,
	formatToolsDump,
	formatUnavailableSaved,
	isDeclaredSwitch,
	toolStatus,
	type ToolLike,
} from "../../src/features/tools/format.js";

const crawl: ToolLike = {
	name: "crawl",
	description: "Crawl a URL and extract markdown.\nKeeps browser state.",
	parameters: {
		type: "object",
		required: ["url"],
		properties: {
			url: { type: "string", description: "Page to crawl" },
			depth: { type: "number", description: "Link depth" },
		},
	},
	promptGuidelines: ["Prefer crawl over fetch for JS-heavy pages."],
	sourceInfo: {
		path: "/packages/pi-crawl4ai/src/index.ts",
		source: "pi-crawl4ai",
		scope: "user",
		origin: "package",
	},
};

test("firstLine keeps only the opening sentence", () => {
	assert.equal(firstLine("Crawl a URL.\nMore later."), "Crawl a URL.");
});

test("formatSource includes package name and path", () => {
	assert.match(formatSource(crawl.sourceInfo), /pi-crawl4ai/);
	assert.match(formatSource(crawl.sourceInfo), /pi-crawl4ai\/src\/index.ts/);
	assert.equal(formatSource(undefined), "unknown");
});

test("formatParameters marks optional fields and keeps descriptions", () => {
	assert.deepEqual(formatParameters(crawl.parameters), [
		"url: string — Page to crawl",
		"depth?: number — Link depth",
	]);
	assert.deepEqual(formatParameters(undefined), []);
});

test("formatToolSummary is a single-line preview", () => {
	assert.equal(formatToolSummary(crawl), "Crawl a URL and extract markdown.  ·  pi-crawl4ai");
});

test("formatToolDetails includes status, source, params, and guidelines", () => {
	const details = formatToolDetails(crawl, { enabled: true });
	assert.match(details, /status: enabled/);
	assert.match(details, /source: pi-crawl4ai/);
	assert.match(details, /Crawl a URL and extract markdown/);
	assert.match(details, /url: string — Page to crawl/);
	assert.match(details, /depth\?: number — Link depth/);
	assert.match(details, /Prefer crawl over fetch/);
});

test("an inactive indirect tool is reported as reachable, not plainly disabled", () => {
	assert.equal(toolStatus({ ...crawl, exposure: "deferred" }, { enabled: false }), "inactive (indirect via deferred)");
	assert.equal(toolStatus({ ...crawl, exposure: "codemode" }, { enabled: false }), "inactive (indirect via codemode)");
	assert.equal(toolStatus({ ...crawl, exposure: "deferred" }, { enabled: true }), "enabled");
});

test("a hidden tool is unavailable rather than toggleable", () => {
	assert.equal(toolStatus({ ...crawl, exposure: "hidden" }, { enabled: false }), "unavailable (hidden)");
	assert.match(formatToolDetails({ ...crawl, exposure: "hidden" }, { enabled: false }), /exposure: hidden/);
});

test("only a declared-switch exposure is a real on/off decision", () => {
	// Declared to the model while active, so the session toggle is enforced.
	assert.equal(isDeclaredSwitch({ ...crawl, exposure: "direct" }), true);
	assert.equal(isDeclaredSwitch({ ...crawl, exposure: "model-only" }), true);
	// Pi's registration default, and what a catalog without exposure metadata means.
	assert.equal(isDeclaredSwitch(crawl), true);
	// Reachable while inactive, so "off" is not a decision: tool_search or a script
	// can still reach them, and activation has no effect on a hidden tool.
	assert.equal(isDeclaredSwitch({ ...crawl, exposure: "codemode" }), false);
	assert.equal(isDeclaredSwitch({ ...crawl, exposure: "deferred" }), false);
	assert.equal(isDeclaredSwitch({ ...crawl, exposure: "hidden" }), false);
});

test("formatToolsDump lists every tool without sending extra metadata", () => {
	const dump = formatToolsDump([crawl, { name: "read", description: "Read a file" }], {
		enabledTools: ["read"],
	});
	assert.match(dump, /crawl {2}\[disabled\]/);
	assert.match(dump, /read {2}\[enabled\]/);
	assert.match(dump, /---/);
});

test("formatToolsDump distinguishes indirect reachability", () => {
	const dump = formatToolsDump(
		[
			{ name: "mcp__admin__save", description: "Save", exposure: "deferred" },
			{ name: "mcp__admin__gone", description: "Gone", exposure: "hidden" },
		],
		{ enabledTools: [] },
	);
	assert.match(dump, /mcp__admin__save {2}\[inactive \(indirect via deferred\)\]/);
	assert.match(dump, /mcp__admin__gone {2}\[unavailable \(hidden\)\]/);
});

test("formatUnavailableSaved reports preserved names and stays empty otherwise", () => {
	assert.equal(formatUnavailableSaved([]), "");
	const text = formatUnavailableSaved(["mcp__gone__one", "mcp__gone__two"]);
	assert.match(text, /not registered in this session/);
	assert.match(text, /mcp__gone__one/);
	assert.match(text, /mcp__gone__two/);
});
