import assert from "node:assert/strict";
import test from "node:test";

import { activePresetName, declaresToolLoadout, sameToolSet } from "../../src/features/tools/state.js";

test("sameToolSet ignores order", () => {
	assert.equal(sameToolSet(["read", "bash"], ["bash", "read"]), true);
	assert.equal(sameToolSet(["read"], ["read", "bash"]), false);
});

test("a transcript without a system loadout has not chosen yet", () => {
	assert.equal(declaresToolLoadout([]), false);
	assert.equal(declaresToolLoadout([{ type: "message", message: { role: "user", content: "hi" } }]), false);
	assert.equal(declaresToolLoadout([{ type: "message", message: { role: "system", toolsAdded: [] } }]), false);
});

test("a declared loadout marks resume, fork, and reload as already chosen", () => {
	assert.equal(
		declaresToolLoadout([
			{ type: "message", message: { role: "system", toolsAdded: [{ name: "read" }] } },
			{ type: "message", message: { role: "user", content: "hi" } },
		]),
		true,
	);
});

test("the newest system entry decides, so a re-declared loadout still counts", () => {
	assert.equal(
		declaresToolLoadout([
			{ type: "message", message: { role: "system", toolsAdded: [{ name: "read" }] } },
			{ type: "custom", customType: "preset-state", data: { name: "ops" } },
			{ type: "message", message: { role: "system", toolsAdded: [{ name: "bash" }] } },
		]),
		true,
	);
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
