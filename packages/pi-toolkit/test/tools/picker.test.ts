import assert from "node:assert/strict";
import test from "node:test";

import type { ToolLike } from "../../src/features/tools/format.js";
import {
	buildToolPickerRows,
	INDIRECT_SECTION_LABEL,
	INDIRECT_SECTION_VALUE,
} from "../../src/features/tools/picker.js";

const tools: ToolLike[] = [
	{ name: "read", description: "Read a file", exposure: "direct" },
	{ name: "web", description: "Search the web", exposure: "model-only" },
	{ name: "agent_browser_action", description: "Act on a browser", exposure: "deferred" },
	{ name: "models", description: "Classify with a model", exposure: "codemode" },
	{ name: "secret", description: "Not reachable", exposure: "hidden" },
];

test("declared tools stay toggleable and indirect tools are listed read-only", () => {
	const rows = buildToolPickerRows(tools, {
		enabledTools: new Set(["read", "agent_browser_action"]),
	});

	assert.deepEqual(
		rows.map((row) => row.value),
		["read", "web", INDIRECT_SECTION_VALUE, "agent_browser_action", "models"],
	);
	assert.equal(rows[0]?.current, true);
	assert.equal(rows[1]?.current, false);
	assert.deepEqual(
		{ value: rows[2]?.value, label: rows[2]?.label, kind: rows[2]?.kind },
		{ value: INDIRECT_SECTION_VALUE, label: INDIRECT_SECTION_LABEL, kind: "header" },
	);
	assert.equal(rows[3]?.selectable, false);
	assert.equal(rows[3]?.badge, "deferred");
	assert.equal(rows[4]?.selectable, false);
	assert.equal(rows[4]?.badge, "codemode");
});

test("hidden tools are absent and an all-declared catalog gets no section", () => {
	const rows = buildToolPickerRows(tools, { enabledTools: new Set() });
	assert.ok(!rows.some((row) => row.value === "secret"));

	const declaredOnly = buildToolPickerRows(
		tools.filter((tool) => tool.exposure !== "deferred" && tool.exposure !== "codemode"),
		{ enabledTools: new Set() },
	);
	assert.ok(!declaredOnly.some((row) => row.kind === "header"));
});

test("details mode expands every listed row, including indirect tools", () => {
	const rows = buildToolPickerRows(tools, { enabledTools: new Set(), detailsMode: true });
	const indirect = rows.find((row) => row.value === "agent_browser_action");
	assert.ok(indirect);
	assert.match(indirect.description ?? "", /status: inactive \(indirect via deferred\)/);
	assert.match(indirect.description ?? "", /exposure: deferred/);
});
