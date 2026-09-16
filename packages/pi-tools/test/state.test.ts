import assert from "node:assert/strict";
import test from "node:test";

import { activePresetName, resolveEnabledTools, sameToolSet } from "../src/state.js";

const all = ["read", "bash", "edit", "read_file", "search_replace"];

test("without a snapshot, live active tools win", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: all,
			activeTools: ["read", "read_file"],
		}),
		["read", "read_file"],
	);
});

test("without a snapshot or live active tools, every known tool is enabled", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: all,
			activeTools: [],
		}),
		all,
	);
});

test("a legacy snapshot keeps tools it never knew about enabled", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: all,
			activeTools: ["read"],
			savedTools: ["read", "bash"],
		}),
		["read", "bash", "edit", "read_file", "search_replace"],
	);
});

test("a snapshot keeps an explicit disable only when the tool is not live", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: all,
			activeTools: ["read", "bash"],
			savedTools: ["read", "bash"],
			knownTools: all,
		}),
		["read", "bash"],
	);
});

test("a live-active tool stays enabled even if the snapshot omitted it", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: all,
			activeTools: ["read", "bash", "read_file", "search_replace"],
			savedTools: ["read", "bash"],
			knownTools: all,
		}),
		["read", "bash", "read_file", "search_replace"],
	);
});

test("a snapshot with knownTools still enables tools registered later", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: all,
			activeTools: ["read"],
			savedTools: ["read"],
			knownTools: ["read", "bash", "edit"],
		}),
		["read", "read_file", "search_replace"],
	);
});

test("unknown names from the snapshot or active list are ignored", () => {
	assert.deepEqual(
		resolveEnabledTools({
			allToolNames: ["read"],
			activeTools: ["read", "gone"],
			savedTools: ["read", "also-gone"],
		}),
		["read"],
	);
});

test("sameToolSet ignores order", () => {
	assert.equal(sameToolSet(["read", "bash"], ["bash", "read"]), true);
	assert.equal(sameToolSet(["read"], ["read", "bash"]), false);
});

test("the recorded preset state makes the preset the tool-set owner", () => {
	assert.equal(
		activePresetName({
			entries: [
				{ type: "message" },
				{ type: "custom", customType: "tools-print", data: { query: "crawl" } },
				{ type: "custom", customType: "preset-state", data: { name: "research" } },
			],
		}),
		"research",
	);
});

test("the newest preset state wins over an earlier one", () => {
	assert.equal(
		activePresetName({
			entries: [
				{ type: "custom", customType: "preset-state", data: { name: "plan" } },
				{ type: "custom", customType: "preset-state", data: { name: "implement" } },
			],
		}),
		"implement",
	);
});

test("clearing a preset hands the tool set back to the project defaults", () => {
	assert.equal(
		activePresetName({
			entries: [
				{ type: "custom", customType: "preset-state", data: { name: "plan" } },
				{ type: "custom", customType: "preset-state", data: { name: null } },
			],
		}),
		undefined,
	);
});

test("with no preset state, project defaults keep ownership", () => {
	assert.equal(activePresetName({}), undefined);
	assert.equal(
		activePresetName({
			entries: [
				{ type: "custom", customType: "preset-state" },
				{ type: "custom", customType: "preset-state", data: { name: "  " } },
				{ type: "custom", customType: "preset-state", data: { name: 7 } },
			],
		}),
		undefined,
	);
});
