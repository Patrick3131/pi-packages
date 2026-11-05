import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

/**
 * The Git resource Pi installs reads the repository root `pi.extensions`, not this
 * package's own list, so an entry added here alone never loads. Order matters too:
 * `inline-actions` must follow `skill-mentions` to wrap its `$` provider.
 */
function extensions(manifestUrl: URL): string[] {
 const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {pi?: {extensions?: string[]}};
 const baseDir = dirname(fileURLToPath(manifestUrl));
 return (manifest.pi?.extensions ?? []).map((entry) => resolve(baseDir, entry));
}

const packageExtensions = extensions(new URL("../package.json", import.meta.url));
const rootExtensions = extensions(new URL("../../../package.json", import.meta.url));

test("every feature entry point is declared in the root Pi manifest", () => {
 const missing = packageExtensions.filter((entry) => !rootExtensions.includes(entry));
 assert.deepEqual(missing, [], `add these to the root package.json pi.extensions: ${missing.join(", ")}`);
});

test("the root Pi manifest keeps this package's load order", () => {
 const positions = packageExtensions.map((entry) => rootExtensions.indexOf(entry));
 const sorted = [...positions].sort((left, right) => left - right);
 assert.deepEqual(positions, sorted, "root pi.extensions reorders this package's features");
});
