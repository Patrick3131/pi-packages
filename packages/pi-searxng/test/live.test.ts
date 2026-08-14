import assert from "node:assert/strict";
import test from "node:test";

import { resolveSearxngBaseUrl } from "../src/config.js";
import { searchSearxng } from "../src/search.js";

test("live SearXNG instance returns JSON results", async (t) => {
	const baseUrl = resolveSearxngBaseUrl();
	let reachable = false;
	try {
		const probe = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(4000) });
		reachable = probe.ok;
	} catch {
		try {
			const probe = await fetch(
				`${baseUrl}/search?q=pi+coding+agent&format=json&engines=brave,duckduckgo`,
				{ signal: AbortSignal.timeout(8000) },
			);
			reachable = probe.ok;
		} catch {
			reachable = false;
		}
	}

	if (!reachable) {
		t.skip(`SearXNG is not reachable at ${baseUrl}`);
		return;
	}

	const result = await searchSearxng({ query: "pi coding agent", maxResults: 3 });
	assert.ok(result.details.count > 0, "expected at least one result");
	assert.ok(result.details.results[0]?.url?.startsWith("http"), "expected an http result URL");
	assert.match(result.text, /Search results for: pi coding agent/);
});
