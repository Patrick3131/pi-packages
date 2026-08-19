import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import { fitPickerLine } from "../src/tools.js";

test("picker lines fit a narrow terminal", () => {
	const hint = "  i more details · s save project defaults · Enter/Space to change · Esc to cancel";
	const rendered = fitPickerLine(`\u001b[2m${hint}\u001b[22m`, 73);

	assert.equal(visibleWidth(rendered), 73);
	assert.match(rendered, /\.\.\./);
});

test("picker lines are unchanged when they already fit", () => {
	const line = "Tool Configuration";

	assert.equal(fitPickerLine(line, 73), line);
});
