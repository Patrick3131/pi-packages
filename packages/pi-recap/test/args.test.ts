import assert from "node:assert/strict";
import test from "node:test";

import { parseRecapArgs, RECAP_HELP } from "../src/args.js";

test("parseRecapArgs returns browser defaults for empty input", () => {
	const args = parseRecapArgs("");
	assert.equal(args.help, false);
	assert.equal(args.full, false);
	assert.equal(args.text, false);
	assert.equal(args.open, true);
	assert.equal(args.summarize, false);
	assert.equal(args.yes, false);
	assert.equal(args.limit, undefined);
	assert.deepEqual(args.errors, []);
});

test("parseRecapArgs reads value flags and boolean flags", () => {
	const args = parseRecapArgs("--limit 2 --model anthropic/claude-haiku-4-5 --summarize --yes --full --text --no-open");
	assert.equal(args.limit, 2);
	assert.equal(args.model, "anthropic/claude-haiku-4-5");
	assert.equal(args.summarize, true);
	assert.equal(args.yes, true);
	assert.equal(args.full, true);
	assert.equal(args.text, true);
	assert.equal(args.open, false);
	assert.deepEqual(args.errors, []);
});

test("parseRecapArgs accepts --flag=value", () => {
	const args = parseRecapArgs("--limit=5 --preview 120");
	assert.equal(args.limit, 5);
	assert.equal(args.preview, 120);
	assert.deepEqual(args.errors, []);
});

test("parseRecapArgs reads the auto verb", () => {
	assert.equal(parseRecapArgs("auto on").auto, "on");
	assert.equal(parseRecapArgs("auto off").auto, "off");
	assert.equal(parseRecapArgs("auto status").auto, "status");
});

test("parseRecapArgs reads --messages and the help verb", () => {
	assert.equal(parseRecapArgs("--messages").messages, true);
	assert.equal(parseRecapArgs("").messages, false);
	assert.equal(parseRecapArgs("help").help, true);
	assert.ok(RECAP_HELP.includes("--messages"));
	assert.ok(RECAP_HELP.includes("retentionDays"));
});

test("parseRecapArgs reports invalid numbers, missing values, and unknown flags", () => {
	assert.deepEqual(parseRecapArgs("--limit zero").errors, ["--limit expects a positive integer"]);
	assert.deepEqual(parseRecapArgs("--limit 0").errors, ["--limit expects a positive integer"]);
	assert.deepEqual(parseRecapArgs("--model").errors, ["--model expects a value"]);
	assert.deepEqual(parseRecapArgs("--bogus").errors, ["unknown flag: --bogus"]);
	assert.deepEqual(parseRecapArgs("auto sideways").errors, ["unknown auto action: sideways"]);
	assert.deepEqual(parseRecapArgs("extra").errors, ["unexpected argument: extra"]);
});

test("parseRecapArgs treats --help as help and ignores further validation", () => {
	const args = parseRecapArgs("--help");
	assert.equal(args.help, true);
	assert.deepEqual(args.errors, []);
	assert.ok(RECAP_HELP.includes("/recap"));
});
