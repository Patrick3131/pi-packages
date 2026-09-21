import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { pruneRecapFiles, selectExpiredRecaps } from "../src/config.js";

const DAY = 24 * 60 * 60 * 1000;

test("selectExpiredRecaps selects only old generated recap files", () => {
	const now = Date.UTC(2026, 8, 21, 12, 0, 0);
	const files = [
		{ name: "recap-session-a-20260901-120000.html", mtimeMs: now - 20 * DAY },
		{ name: "recap-session-a-20260919-120000.txt", mtimeMs: now - 2 * DAY },
		{ name: "summary-session-a.json", mtimeMs: now - 40 * DAY },
		{ name: "settings.json", mtimeMs: now - 40 * DAY },
		{ name: "recap-summary-notes.md", mtimeMs: now - 40 * DAY },
	];
	assert.deepEqual(selectExpiredRecaps(files, now, 14), ["recap-session-a-20260901-120000.html"]);
	assert.deepEqual(selectExpiredRecaps(files, now, 0), [], "retention 0 keeps everything");
});

test("pruneRecapFiles deletes expired recaps and keeps caches and settings", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-recap-prune-"));
	const old = join(dir, "recap-old-20260901-120000.html");
	const fresh = join(dir, "recap-fresh-20260921-120000.html");
	const cache = join(dir, "summary-session.json");
	const settings = join(dir, "settings.json");
	for (const path of [old, fresh, cache, settings]) writeFileSync(path, "x", "utf-8");
	const oldTime = new Date(Date.now() - 30 * DAY);
	utimesSync(old, oldTime, oldTime);

	const deleted = pruneRecapFiles(dir, 14);
	assert.deepEqual(deleted, ["recap-old-20260901-120000.html"]);
	assert.deepEqual(readdirSync(dir).sort(), ["recap-fresh-20260921-120000.html", "settings.json", "summary-session.json"]);
});
