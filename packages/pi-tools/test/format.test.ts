import assert from "node:assert/strict";
import test from "node:test";

import {
	firstLine,
	formatParameters,
	formatSource,
	formatToolDetails,
	formatToolSummary,
	formatToolsDump,
	type ToolLike,
} from "../src/format.js";

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

test("formatToolsDump lists every tool without sending extra metadata", () => {
	const dump = formatToolsDump([crawl, { name: "read", description: "Read a file" }], {
		enabledTools: ["read"],
	});
	assert.match(dump, /crawl {2}\[disabled\]/);
	assert.match(dump, /read {2}\[enabled\]/);
	assert.match(dump, /---/);
});
