import assert from "node:assert/strict";
import test from "node:test";

import { resolvePresetToolNames } from "../src/resolve-tools.js";

const registry = [
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"crawl",
	"crawl_read",
	"agent_browser",
	"web_search_searxng",
];

test("keeps every requested name that is registered", () => {
	const { valid, unknown } = resolvePresetToolNames({
		requested: ["read", "bash", "edit", "write", "grep", "find", "ls"],
		allToolNames: registry,
	});
	assert.deepEqual(unknown, []);
	assert.deepEqual(valid, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
});

test("activates network and browser tools only when a preset asks for them", () => {
	const { valid } = resolvePresetToolNames({
		requested: ["read", "crawl", "web_search_searxng"],
		allToolNames: registry,
	});
	assert.ok(valid.includes("crawl"));
	assert.ok(valid.includes("web_search_searxng"));
	assert.equal(valid.includes("agent_browser"), false);
});

test("deduplicates repeated names", () => {
	const { valid } = resolvePresetToolNames({
		requested: ["read", "read", "grep"],
		allToolNames: registry,
	});
	assert.deepEqual(valid, ["read", "grep"]);
});

test("reports names that are not registered, once each", () => {
	const { valid, unknown } = resolvePresetToolNames({
		requested: ["read", "nope", "nope", "read_file"],
		allToolNames: registry,
	});
	assert.deepEqual(valid, ["read"]);
	assert.deepEqual(unknown, ["nope", "read_file"]);
});
