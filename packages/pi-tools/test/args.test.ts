import assert from "node:assert/strict";
import test from "node:test";

import { getToolsArgumentCompletions, matchTools, parseToolsArgs } from "../src/args.js";
import type { ToolLike } from "../src/format.js";

const tools: ToolLike[] = [
	{ name: "crawl", description: "Crawl a URL" },
	{ name: "crawl_read", description: "Read a crawl cache" },
	{ name: "read", description: "Read a file" },
	{ name: "bash", description: "Run a shell command" },
];

test("parseToolsArgs treats empty input as the picker", () => {
	assert.deepEqual(parseToolsArgs(""), { action: "picker" });
	assert.deepEqual(parseToolsArgs("   "), { action: "picker" });
});

test("parseToolsArgs accepts print with an optional query", () => {
	assert.deepEqual(parseToolsArgs("print"), { action: "print", query: "" });
	assert.deepEqual(parseToolsArgs("PRINT crawl"), { action: "print", query: "crawl" });
	assert.deepEqual(parseToolsArgs("print crawl_read"), { action: "print", query: "crawl_read" });
});

test("parseToolsArgs accepts save", () => {
	assert.deepEqual(parseToolsArgs("save"), { action: "save" });
	assert.deepEqual(parseToolsArgs("SAVE"), { action: "save" });
});

test("parseToolsArgs rejects unknown verbs", () => {
	assert.deepEqual(parseToolsArgs("dump"), { action: "unknown", raw: "dump" });
	assert.deepEqual(parseToolsArgs("save extra"), { action: "unknown", raw: "save extra" });
});

test("matchTools prefers exact names, then prefixes, then loose matches", () => {
	assert.deepEqual(
		matchTools(tools, "crawl").map((tool) => tool.name),
		["crawl"],
	);
	assert.deepEqual(
		matchTools(tools, "craw").map((tool) => tool.name),
		["crawl", "crawl_read"],
	);
	assert.deepEqual(
		matchTools(tools, "crawls").map((tool) => tool.name),
		["crawl", "crawl_read"],
	);
	assert.deepEqual(
		matchTools(tools, "read").map((tool) => tool.name),
		["read"],
	);
	assert.deepEqual(matchTools(tools, "nope"), []);
	assert.deepEqual(
		matchTools(tools, "").map((tool) => tool.name),
		["crawl", "crawl_read", "read", "bash"],
	);
});

test("completions offer print, then matching tool names", () => {
	const printOnly = getToolsArgumentCompletions("pr", tools);
	assert.deepEqual(
		printOnly?.map((item) => item.value),
		["print"],
	);
	assert.deepEqual(
		getToolsArgumentCompletions("s", tools)?.map((item) => item.value),
		["save"],
	);

	const afterPrint = getToolsArgumentCompletions("print ", tools);
	assert.deepEqual(
		afterPrint?.map((item) => item.value),
		["print crawl", "print crawl_read", "print read", "print bash"],
	);

	const crawlPrefix = getToolsArgumentCompletions("print cra", tools);
	assert.deepEqual(
		crawlPrefix?.map((item) => item.value),
		["print crawl", "print crawl_read"],
	);
	assert.equal(crawlPrefix?.[0]?.label, "crawl");

	assert.equal(getToolsArgumentCompletions("dump", tools), null);
	assert.equal(getToolsArgumentCompletions("print nope", tools), null);
});
