import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
	DEFAULT_RETENTION_DAYS,
	loadRecapSettings,
	parseModelSpec,
	resolveAutoSetting,
	resolveRecapDir,
	resolveRecapModelSpec,
	resolveRecapPaths,
	resolveRetentionDays,
	safeSessionId,
	saveRecapSettings,
} from "../src/config.js";

test("resolveRecapPaths prefers PI_RECAP_DIR over the agent directory", () => {
	const agentDir = "/home/user/.pi/agent";
	const fallback = resolveRecapPaths(agentDir, {});
	assert.equal(fallback.dir, join(agentDir, "recaps"));
	assert.equal(fallback.settingsPath, join(agentDir, "recaps", "settings.json"));

	const overridden = resolveRecapPaths(agentDir, { PI_RECAP_DIR: "/tmp/recaps" });
	assert.equal(overridden.dir, resolve("/tmp/recaps"));
	assert.equal(overridden.settingsPath, join(resolve("/tmp/recaps"), "settings.json"));
});

test("settings round-trip and tolerate corrupt or missing files", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-config-"));
	const path = join(dir, "settings.json");
	assert.deepEqual(loadRecapSettings(path), {});

	saveRecapSettings(path, { auto: true, model: "anthropic/claude-haiku-4-5", dir: "out" });
	assert.deepEqual(loadRecapSettings(path), { auto: true, model: "anthropic/claude-haiku-4-5", dir: "out" });

	writeFileSync(path, "{not json", "utf-8");
	assert.deepEqual(loadRecapSettings(path), {});
});

test("resolveRecapDir resolves relative settings dirs against the base dir", () => {
	const paths = resolveRecapPaths("/home/user/.pi/agent", { PI_RECAP_DIR: "/tmp/base" });
	assert.equal(resolveRecapDir(paths, {}), resolve("/tmp/base"));
	assert.equal(resolveRecapDir(paths, { dir: "custom" }), resolve("/tmp/base", "custom"));
	assert.equal(resolveRecapDir(paths, { dir: "/tmp/absolute" }), "/tmp/absolute");
});

test("model spec and auto resolution follow flag > env > settings precedence", () => {
	const settings = { model: "settings/model", auto: false };
	assert.equal(resolveRecapModelSpec(settings, {}, undefined), "settings/model");
	assert.equal(resolveRecapModelSpec(settings, { PI_RECAP_MODEL: "env/model" }, undefined), "env/model");
	assert.equal(resolveRecapModelSpec(settings, { PI_RECAP_MODEL: "env/model" }, "flag/model"), "flag/model");

	assert.equal(resolveAutoSetting(settings, {}), false);
	assert.equal(resolveAutoSetting(settings, { PI_RECAP_AUTO: "1" }), true);
	assert.equal(resolveAutoSetting({ auto: true }, {}), true);
});

test("parseModelSpec splits provider and model and rejects bare ids", () => {
	assert.deepEqual(parseModelSpec("anthropic/claude-haiku-4-5"), { provider: "anthropic", id: "claude-haiku-4-5" });
	assert.deepEqual(parseModelSpec("openrouter/meta/llama-3"), { provider: "openrouter", id: "meta/llama-3" });
	assert.equal(parseModelSpec("claude-haiku-4-5"), null);
	assert.equal(parseModelSpec("/"), null);
});

test("retention resolution follows env > settings > 14-day default and allows 0", () => {
	assert.equal(resolveRetentionDays({}, {}), DEFAULT_RETENTION_DAYS);
	assert.equal(resolveRetentionDays({ retentionDays: 7 }, {}), 7);
	assert.equal(resolveRetentionDays({ retentionDays: 7 }, { PI_RECAP_RETENTION_DAYS: "30" }), 30);
	assert.equal(resolveRetentionDays({ retentionDays: 7 }, { PI_RECAP_RETENTION_DAYS: "0" }), 0);
	assert.equal(resolveRetentionDays({ retentionDays: 7 }, { PI_RECAP_RETENTION_DAYS: "nope" }), 7);
	const path = join(mkdtempSync(join(tmpdir(), "pi-recap-retention-")), "settings.json");
	saveRecapSettings(path, { retentionDays: 3 });
	assert.equal(loadRecapSettings(path).retentionDays, 3);
});

test("safeSessionId keeps filesystem-safe characters", () => {
	assert.equal(safeSessionId("11111111-2222-3333"), "11111111-2222-3333");
	assert.equal(safeSessionId("a/b c"), "a_b_c");
});
