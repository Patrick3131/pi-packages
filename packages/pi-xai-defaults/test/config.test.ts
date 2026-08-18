import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	activeNameFor,
	defaultXaiDefaultsConfig,
	enabledToolNames,
	getXaiDefaultsConfigPaths,
	isXaiCompatibleProvider,
	loadXaiDefaultsConfig,
	mergeXaiDefaultsConfig,
	parseXaiDefaultsJson,
} from "../src/config.js";

test("missing files keep every extra on", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-xai-defaults-"));
	assert.deepEqual(
		loadXaiDefaultsConfig(join(dir, "missing-global.json"), join(dir, "missing-project.json")),
		defaultXaiDefaultsConfig(),
	);
});

test("parseXaiDefaultsJson requires true or false", () => {
	const parsed = parseXaiDefaultsJson(
		JSON.stringify({
			enabled: true,
			tools: { web_search: true, xai_image_to_video: false },
		}),
	);
	assert.equal(parsed.enabled, true);
	assert.equal(parsed.tools?.web_search, true);
	assert.equal(parsed.tools?.xai_image_to_video, false);
	assert.throws(() => parseXaiDefaultsJson(JSON.stringify({ enabled: 1 })), /true or false/);
	assert.throws(() => parseXaiDefaultsJson(JSON.stringify({ tools: { web_search: "yes" } })), /true or false/);
	assert.throws(() => parseXaiDefaultsJson(JSON.stringify({ tools: { nope: true } })), /unknown tool/);
});

test("project file overrides selected tools and accepts web_search aliases", () => {
	const merged = mergeXaiDefaultsConfig(
		{ tools: { web_search: true, xai_generate_image: true } as never },
		parseXaiDefaultsJson(JSON.stringify({ tools: { xai_grok_web_search: false, xai_image_to_video: false } })),
	);
	assert.equal(merged.tools.web_search, false);
	assert.equal(merged.tools.xai_generate_image, true);
	assert.equal(merged.tools.xai_image_to_video, false);
	assert.equal(merged.enabled, true);
});

test("enabled: false turns the package off", () => {
	assert.deepEqual(enabledToolNames({ enabled: false, tools: defaultXaiDefaultsConfig().tools }), []);
});

test("enabledToolNames returns only true tools", () => {
	const config = defaultXaiDefaultsConfig();
	config.tools.xai_image_to_video = false;
	config.tools.xai_multi_agent = false;
	const names = enabledToolNames(config);
	assert.ok(names.includes("web_search"));
	assert.ok(names.includes("xai_generate_image"));
	assert.equal(names.includes("xai_image_to_video"), false);
	assert.equal(names.includes("xai_multi_agent"), false);
});

test("loadXaiDefaultsConfig merges files", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-xai-defaults-"));
	const globalPath = join(dir, "global.json");
	const projectPath = join(dir, "project.json");
	writeFileSync(
		globalPath,
		JSON.stringify({
			enabled: true,
			tools: { web_search: true, xai_generate_image: true, xai_image_to_video: false },
		}),
	);
	writeFileSync(projectPath, JSON.stringify({ tools: { xai_generate_image: false } }));
	const loaded = loadXaiDefaultsConfig(globalPath, projectPath);
	assert.equal(loaded.tools.web_search, true);
	assert.equal(loaded.tools.xai_generate_image, false);
	assert.equal(loaded.tools.xai_image_to_video, false);
});

test("getXaiDefaultsConfigPaths uses the agent dir and project .pi folder", () => {
	assert.deepEqual(getXaiDefaultsConfigPaths("/repo", "/home/user/.pi/agent"), {
		globalPath: "/home/user/.pi/agent/xai-defaults.json",
		projectPath: "/repo/.pi/xai-defaults.json",
	});
});

test("only xAI providers get the extras", () => {
	assert.equal(isXaiCompatibleProvider("xai-auth"), true);
	assert.equal(isXaiCompatibleProvider("xai"), true);
	assert.equal(isXaiCompatibleProvider("anthropic"), false);
});

test("web_search maps to the live dispatcher name", () => {
	assert.equal(activeNameFor("web_search"), "xai_grok_web_search");
	assert.equal(activeNameFor("xai_generate_image"), "xai_generate_image");
});
