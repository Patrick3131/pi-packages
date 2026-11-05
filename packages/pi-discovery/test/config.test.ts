import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHttpUrl,
  isSearxngEnabledByEnv,
  isSocialEnabledByEnv,
  resolveDefaultEngines,
  resolveSearxngBaseUrl,
  resolveSocialConfig,
  SOCIAL_DEFAULT_HTTP_TIMEOUT_MS,
} from "../src/config.js";
import { DEFAULT_ENGINES, DEFAULT_SEARXNG_URL } from "../src/types.js";

test("resolveSearxngBaseUrl uses the discovery-services VPN default", () => {
  assert.equal(resolveSearxngBaseUrl({}), DEFAULT_SEARXNG_URL);
});

test("resolveSearxngBaseUrl prefers SEARXNG_URL and strips a trailing slash", () => {
  assert.equal(
    resolveSearxngBaseUrl({ SEARXNG_URL: "http://172.18.0.1:18089/" }),
    "http://172.18.0.1:18089",
  );
});

test("resolveDefaultEngines matches the Dokploy instance", () => {
  assert.equal(resolveDefaultEngines({}), DEFAULT_ENGINES);
  assert.equal(
    resolveDefaultEngines({ SEARXNG_ENGINES: "duckduckgo" }),
    "duckduckgo",
  );
});

test("isSearxngEnabledByEnv is off unless explicitly enabled", () => {
  assert.equal(isSearxngEnabledByEnv({}), false);
  assert.equal(
    isSearxngEnabledByEnv({ DISCOVERY_WEB_SEARCH_ENABLED: "0" }),
    false,
  );
  assert.equal(
    isSearxngEnabledByEnv({ DISCOVERY_WEB_SEARCH_ENABLED: "1" }),
    true,
  );
  assert.equal(
    isSearxngEnabledByEnv({ DISCOVERY_WEB_SEARCH_ENABLED: "true" }),
    true,
  );
});

test("assertHttpUrl rejects non-http URLs", () => {
  assert.throws(() => assertHttpUrl("file:///etc/passwd"), /http/);
  assert.doesNotThrow(() => assertHttpUrl("http://10.8.0.1:18089"));
});

test("social config is default-off with a 130000 ms HTTP floor", () => {
  assert.equal(isSocialEnabledByEnv({}), false);
  assert.equal(isSocialEnabledByEnv({ DISCOVERY_SOCIAL_ENABLED: "0" }), false);
  assert.equal(isSocialEnabledByEnv({ DISCOVERY_SOCIAL_ENABLED: "1" }), true);
  assert.equal(isSocialEnabledByEnv({ DISCOVERY_SOCIAL_ENABLED: "TRUE " }), true);
  assert.equal(SOCIAL_DEFAULT_HTTP_TIMEOUT_MS, 130000);
  assert.deepEqual(resolveSocialConfig({}), {
    baseUrl: "http://10.8.0.1:18080",
    timeoutMs: 130000,
  });
  assert.equal(
    resolveSocialConfig({ DISCOVERY_SOCIAL_TIMEOUT_MS: "190000" }).timeoutMs,
    190000,
  );
  for (const value of ["0", "-1", "1.5", "abc"])
    assert.throws(() => resolveSocialConfig({ DISCOVERY_SOCIAL_TIMEOUT_MS: value }));
});
