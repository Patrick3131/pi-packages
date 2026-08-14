import assert from "node:assert/strict";
import test from "node:test";

import {
	buildResponseText,
	buildSearchUrl,
	normalizeResults,
	normalizeSearchResult,
	searchSearxng,
	truncateSnippet,
} from "../src/search.js";

test("buildSearchUrl targets JSON search on the default instance", () => {
	const url = buildSearchUrl({ query: "pi coding agent" }, "http://10.8.0.1:18089", "brave,duckduckgo");
	assert.equal(url.origin, "http://10.8.0.1:18089");
	assert.equal(url.pathname, "/search");
	assert.equal(url.searchParams.get("q"), "pi coding agent");
	assert.equal(url.searchParams.get("format"), "json");
	assert.equal(url.searchParams.get("engines"), "brave,duckduckgo");
	assert.equal(url.searchParams.get("safesearch"), "0");
	assert.equal(url.searchParams.get("pageno"), "1");
});

test("buildSearchUrl keeps an explicit engines override", () => {
	const url = buildSearchUrl(
		{ query: "ads", engines: "duckduckgo" },
		"http://172.18.0.1:18089",
		"brave,duckduckgo",
	);
	assert.equal(url.searchParams.get("engines"), "duckduckgo");
});

test("normalizeResults drops duplicates and rows without a URL", () => {
	const results = normalizeResults(
		[
			{ title: "One", url: "https://example.com/a", content: "a" },
			{ title: "Missing" },
			{ title: "Dup", url: "https://example.com/a", content: "ignored" },
			{ title: "Two", url: "https://example.com/b", content: "b" },
		],
		5,
	);
	assert.deepEqual(
		results.map((item) => item.url),
		["https://example.com/a", "https://example.com/b"],
	);
});

test("normalizeSearchResult uses the URL when the title is empty", () => {
	assert.deepEqual(normalizeSearchResult({ url: "https://example.com" }), {
		title: "https://example.com",
		url: "https://example.com",
	});
});

test("truncateSnippet and buildResponseText stay compact", () => {
	assert.equal(truncateSnippet("  hello   world  "), "hello world");
	assert.match(truncateSnippet("x".repeat(300)) ?? "", /…$/);
	const text = buildResponseText("q", [{ title: "Pi", url: "https://pi.dev", content: "agent", engine: "brave" }]);
	assert.match(text, /Search results for: q/);
	assert.match(text, /https:\/\/pi\.dev/);
	assert.match(text, /brave/);
});

test("searchSearxng uses the injected fetch and returns details", async () => {
	const calls: string[] = [];
	const fetchImpl = async (input: URL | RequestInfo) => {
		calls.push(String(input));
		return new Response(
			JSON.stringify({
				results: [{ title: "Pi Coding Agent", url: "https://pi.dev", content: "A coding agent", engine: "brave" }],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	};

	const result = await searchSearxng(
		{ query: "pi coding agent", maxResults: 3 },
		{ env: { SEARXNG_URL: "http://10.8.0.1:18089" }, fetchImpl: fetchImpl as typeof fetch },
	);

	assert.equal(result.details.count, 1);
	assert.equal(result.details.results[0]?.url, "https://pi.dev");
	assert.match(calls[0] ?? "", /10\.8\.0\.1:18089\/search/);
	assert.match(calls[0] ?? "", /engines=brave%2Cduckduckgo/);
});
