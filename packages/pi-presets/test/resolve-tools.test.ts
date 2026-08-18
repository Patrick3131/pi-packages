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
	"xai_grok_read_file",
	"xai_grok_search_replace",
	"xai_grok_list_dir",
	"xai_grok_grep",
	"xai_grok_run_terminal_command",
	"xai_grok_web_search",
	"xai_generate_image",
];

test("maps Grok public names onto the live dispatchers", () => {
	const { valid, unknown } = resolvePresetToolNames({
		requested: ["read", "read_file", "search_replace", "list_dir", "run_terminal_command"],
		allToolNames: registry,
	});
	assert.deepEqual(unknown, []);
	assert.ok(valid.includes("read"));
	assert.ok(valid.includes("xai_grok_read_file"));
	assert.ok(valid.includes("xai_grok_search_replace"));
	assert.ok(valid.includes("xai_grok_list_dir"));
	assert.ok(valid.includes("xai_grok_run_terminal_command"));
	assert.equal(valid.includes("xai_grok_web_search"), false);
});

test("keeps Grok adapters that match listed Pi capabilities", () => {
	const { valid } = resolvePresetToolNames({
		requested: ["read", "bash", "edit", "write", "grep", "ls"],
		allToolNames: registry,
	});
	assert.ok(valid.includes("xai_grok_read_file"));
	assert.ok(valid.includes("xai_grok_search_replace"));
	assert.ok(valid.includes("xai_grok_list_dir"));
	assert.ok(valid.includes("xai_grok_grep"));
	assert.ok(valid.includes("xai_grok_run_terminal_command"));
});

test("does not force mutating Grok adapters onto a read-only job", () => {
	const { valid } = resolvePresetToolNames({
		requested: ["read", "grep", "find", "ls"],
		allToolNames: registry,
	});
	assert.ok(valid.includes("xai_grok_read_file"));
	assert.ok(valid.includes("xai_grok_grep"));
	assert.ok(valid.includes("xai_grok_list_dir"));
	assert.equal(valid.includes("xai_grok_search_replace"), false);
	assert.equal(valid.includes("xai_grok_run_terminal_command"), false);
	assert.equal(valid.includes("xai_generate_image"), false);
});

test("reports names that are neither registered nor mappable", () => {
	const { unknown } = resolvePresetToolNames({
		requested: ["read", "nope"],
		allToolNames: registry,
	});
	assert.deepEqual(unknown, ["nope"]);
});
