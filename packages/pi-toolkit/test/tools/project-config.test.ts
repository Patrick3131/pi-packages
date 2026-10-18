import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	getProjectToolsPath,
	mergeProjectTools,
	parseProjectToolsJson,
	projectToolOverrides,
	readProjectToolsConfig,
	unavailableSavedToolNames,
	writeProjectToolsConfig,
} from "../../src/features/tools/project-config.js";

test("parseProjectToolsJson requires true or false", () => {
	assert.deepEqual(parseProjectToolsJson(JSON.stringify({ read: true, bash: false })), {
		read: true,
		bash: false,
	});
	assert.throws(() => parseProjectToolsJson(JSON.stringify({ read: 1 })), /true or false/);
});

test("readProjectToolsConfig separates a missing file from an unreadable one", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-tools-read-"));
	mkdirSync(join(dir, ".pi"), { recursive: true });
	const path = join(dir, ".pi", "tools.json");

	assert.deepEqual(readProjectToolsConfig(path), { status: "missing" });

	writeFileSync(path, "{ not json");
	const invalid = readProjectToolsConfig(path);
	assert.equal(invalid.status, "invalid");

	writeFileSync(path, JSON.stringify({ read: true }));
	assert.deepEqual(readProjectToolsConfig(path), { status: "ok", tools: { read: true } });
});

test("projectToolOverrides only speaks about names this catalog knows", () => {
	const tools = { read: true, bash: false, gone: true, also_gone: false };
	assert.deepEqual(projectToolOverrides(tools, ["read", "bash", "write"]), {
		enable: ["read"],
		disable: ["bash"],
	});
});

test("mergeProjectTools keeps keys a smaller catalog cannot see", () => {
	const existing = { read: true, bash: true, mcp__admin__save: true, gone: false };
	const merged = mergeProjectTools({
		existing,
		updateToolNames: ["read", "bash"],
		activeTools: ["read"],
	});

	assert.deepEqual(merged, { read: true, bash: false, mcp__admin__save: true, gone: false });
	assert.deepEqual(existing, { read: true, bash: true, mcp__admin__save: true, gone: false });
});

test("mergeProjectTools on a missing file records only what this session saw", () => {
	assert.deepEqual(
		mergeProjectTools({ updateToolNames: ["read", "bash"], activeTools: ["bash"] }),
		{ bash: true, read: false },
	);
});

test("unavailableSavedToolNames reports saved names this session does not register", () => {
	assert.deepEqual(
		unavailableSavedToolNames({ read: true, gone: true, also_gone: false }, ["read"]),
		["also_gone", "gone"],
	);
});

test("writeProjectToolsConfig writes sorted boolean JSON and leaves no temp file", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-tools-write-"));
	const path = join(dir, ".pi", "tools.json");
	writeProjectToolsConfig(path, { read: true, bash: false });

	assert.equal(readFileSync(path, "utf8"), `${JSON.stringify({ bash: false, read: true }, null, 2)}\n`);
	assert.deepEqual(readdirSync(join(dir, ".pi")), ["tools.json"]);
	assert.equal(getProjectToolsPath("/repo"), "/repo/.pi/tools.json");
});
