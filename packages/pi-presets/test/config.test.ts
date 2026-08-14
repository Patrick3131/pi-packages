import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	getPresetConfigPaths,
	loadPresetsFromPaths,
	mergePresets,
	parsePresetsJson,
} from "../src/config.js";

test("mergePresets lets a project name replace the whole global preset", () => {
	const merged = mergePresets(
		{
			plan: { thinkingLevel: "low", tools: ["read"], instructions: "global" },
			implement: { tools: ["read", "edit"] },
		},
		{
			plan: { thinkingLevel: "high", tools: ["read", "grep"] },
		},
	);

	assert.deepEqual(merged.plan, { thinkingLevel: "high", tools: ["read", "grep"] });
	assert.deepEqual(merged.implement, { tools: ["read", "edit"] });
	assert.equal(merged.plan?.instructions, undefined);
});

test("parsePresetsJson accepts a named job preset", () => {
	const presets = parsePresetsJson(
		JSON.stringify({
			plan: {
				thinkingLevel: "high",
				tools: ["read", "grep"],
				instructions: "Planning only.",
			},
		}),
	);

	assert.deepEqual(presets.plan, {
		thinkingLevel: "high",
		tools: ["read", "grep"],
		instructions: "Planning only.",
	});
});

test("parsePresetsJson rejects an invalid thinking level", () => {
	assert.throws(
		() => parsePresetsJson(JSON.stringify({ plan: { thinkingLevel: "ultra" } })),
		/thinkingLevel/,
	);
});

test("loadPresetsFromPaths merges files and ignores a missing path", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-presets-"));
	const globalPath = join(dir, "global.json");
	const projectPath = join(dir, "project.json");
	writeFileSync(
		globalPath,
		JSON.stringify({
			plan: { tools: ["read"], instructions: "global" },
			implement: { tools: ["read", "edit"] },
		}),
	);
	writeFileSync(projectPath, JSON.stringify({ plan: { tools: ["read", "ls"] } }));

	const merged = loadPresetsFromPaths(globalPath, join(dir, "missing.json"));
	assert.deepEqual(merged.plan?.tools, ["read"]);
	assert.equal(merged.plan?.instructions, "global");

	const overridden = loadPresetsFromPaths(globalPath, projectPath);
	assert.deepEqual(overridden.plan, { tools: ["read", "ls"] });
	assert.deepEqual(overridden.implement?.tools, ["read", "edit"]);
});

test("getPresetConfigPaths uses the agent dir and project .pi folder", () => {
	assert.deepEqual(getPresetConfigPaths("/repo", "/home/user/.pi/agent"), {
		globalPath: "/home/user/.pi/agent/presets.json",
		projectPath: "/repo/.pi/presets.json",
	});
});
