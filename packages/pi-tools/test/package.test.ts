import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("package.json loads tools.ts as the Pi extension", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
		pi?: { extensions?: string[] };
	};
	assert.deepEqual(pkg.pi?.extensions, ["./src/tools.ts"]);
});

test("the extension registers /tools without calling Pi APIs at import time", async () => {
	const source = readFileSync(join(root, "src/tools.ts"), "utf8");
	assert.match(source, /registerCommand\("tools"/);
	assert.match(source, /getArgumentCompletions/);
	assert.match(source, /registerEntryRenderer/);
	assert.match(source, /tools-print/);
	assert.match(source, /export default function toolsExtension/);
	assert.match(source, /pi\.on\("session_start"/);
	const { default: register } = await import("../src/index.js");
	assert.equal(typeof register, "function");
});
