import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	enabledProjectToolNames,
	getProjectToolsPath,
	parseProjectToolsJson,
	reconcileProjectTools,
	snapshotProjectTools,
	writeProjectToolsConfig,
} from "../src/project-config.js";

test("parseProjectToolsJson requires true or false", () => {
	assert.deepEqual(parseProjectToolsJson(JSON.stringify({ read: true, bash: false })), {
		read: true,
		bash: false,
	});
	assert.throws(() => parseProjectToolsJson(JSON.stringify({ read: 1 })), /true or false/);
});

test("first create seeds live-active tools as true and the rest as false", () => {
	const { tools, created, added } = reconcileProjectTools({
		allToolNames: ["read", "bash", "web_search_searxng"],
		activeTools: ["read", "bash"],
	});
	assert.equal(created, true);
	assert.deepEqual(added, ["read", "bash", "web_search_searxng"]);
	assert.equal(tools.read, true);
	assert.equal(tools.bash, true);
	assert.equal(tools.web_search_searxng, false);
});

test("existing files only append unknown tools as false", () => {
	const { tools, created, added } = reconcileProjectTools({
		existing: { read: true, bash: true },
		allToolNames: ["read", "bash", "agent_browser"],
		activeTools: ["read", "bash", "agent_browser"],
	});
	assert.equal(created, false);
	assert.deepEqual(added, ["agent_browser"]);
	assert.equal(tools.read, true);
	assert.equal(tools.bash, true);
	assert.equal(tools.agent_browser, false);
});

test("enabledProjectToolNames ignores unknown and false tools", () => {
	assert.deepEqual(
		enabledProjectToolNames({ read: true, bash: false, gone: true }, ["read", "bash"]),
		["read"],
	);
});

test("snapshot and write keep a sorted boolean map", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-tools-json-"));
	const path = join(dir, ".pi", "tools.json");
	writeProjectToolsConfig(path, snapshotProjectTools(["bash", "read"], ["read"]));
	assert.equal(readFileSync(path, "utf8"), `${JSON.stringify({ bash: false, read: true }, null, 2)}\n`);
	assert.equal(getProjectToolsPath("/repo"), "/repo/.pi/tools.json");
	writeFileSync(path, JSON.stringify({ read: true }));
});
