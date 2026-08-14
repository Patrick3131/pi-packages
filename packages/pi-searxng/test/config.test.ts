import assert from "node:assert/strict";
import test from "node:test";

import { assertHttpUrl, isSearxngEnabledByEnv, resolveDefaultEngines, resolveSearxngBaseUrl } from "../src/config.js";
import { DEFAULT_ENGINES, DEFAULT_SEARXNG_URL } from "../src/types.js";

test("resolveSearxngBaseUrl uses the discovery-services VPN default", () => {
	assert.equal(resolveSearxngBaseUrl({}), DEFAULT_SEARXNG_URL);
});

test("resolveSearxngBaseUrl prefers SEARXNG_URL and strips a trailing slash", () => {
	assert.equal(resolveSearxngBaseUrl({ SEARXNG_URL: "http://172.18.0.1:18089/" }), "http://172.18.0.1:18089");
});

test("resolveDefaultEngines matches the Dokploy instance", () => {
	assert.equal(resolveDefaultEngines({}), DEFAULT_ENGINES);
	assert.equal(resolveDefaultEngines({ SEARXNG_ENGINES: "duckduckgo" }), "duckduckgo");
});

test("isSearxngEnabledByEnv is off unless explicitly enabled", () => {
	assert.equal(isSearxngEnabledByEnv({}), false);
	assert.equal(isSearxngEnabledByEnv({ PI_SEARXNG_ENABLED: "0" }), false);
	assert.equal(isSearxngEnabledByEnv({ PI_SEARXNG_ENABLED: "1" }), true);
	assert.equal(isSearxngEnabledByEnv({ SEARXNG_SEARCH_ENABLED: "true" }), true);
});

test("assertHttpUrl rejects non-http URLs", () => {
	assert.throws(() => assertHttpUrl("file:///etc/passwd"), /http/);
	assert.doesNotThrow(() => assertHttpUrl("http://10.8.0.1:18089"));
});
