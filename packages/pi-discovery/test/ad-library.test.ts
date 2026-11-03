import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adLibraryRequest,
  searchAdLibrary,
  adsForAdvertiser,
  formatAdLibrary,
  AdLibraryClientError,
} from "../src/ad-library.js";
import { resolveAdLibraryConfig, liveEnabled } from "../src/config.js";
const result = {
  id: "test",
  provider: "meta_ad_library",
  mode: "keyword",
  query: "baby carrier",
  country: "US",
  active_only: true,
  ads: [{ archive_id: "1", page_id: "2", page_name: "Brand" }],
  pages: [],
  resolved_page: null,
  failed_pages: [],
  truncation: ["page_cap"],
  partial: false,
  truncated: true,
  timings: { queue_ms: 0, upstream_ms: 40000, total_ms: 40000 },
};
test("single selector validation and long server budget", () => {
  for (const p of [
    {},
    { keyword: "x", domain: "a.com" },
    { domain: "https://a.com" },
    { page_id: "x" },
    { keyword: " " },
    { keyword: "x", timeout_ms: 180001 },
  ])
    assert.throws(() => adLibraryRequest(p), AdLibraryClientError);
  assert.equal(
    adLibraryRequest({ keyword: " x ", country: "de" }).country,
    "DE",
  );
  assert.equal(adLibraryRequest({ keyword: "x" }).timeout_ms, 120000);
  assert.equal(
    adLibraryRequest({ keyword: "x", timeout_ms: 180000 }).timeout_ms,
    180000,
  );
  assert.equal(resolveAdLibraryConfig({}).timeoutMs, 130000);
});
test("wire request, populated metadata, truncation and safe errors", async () => {
  const data = await searchAdLibrary(
    { keyword: "x", timeout_ms: 180000 },
    {
      env: {},
      fetch: async (_url, init) => {
        assert.equal(JSON.parse(String(init?.body)).timeout_ms, 180000);
        return new Response(JSON.stringify(result));
      },
    },
  );
  assert.match(formatAdLibrary(data).text, /truncated \(page_cap\)/);
  assert.equal(formatAdLibrary(data).details.requestId, "test");
  await assert.rejects(
    searchAdLibrary(
      { keyword: "x" },
      {
        env: {},
        fetch: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "ad_library_rate_limited",
                request_id: "safe",
                message: "SECRET",
              },
            }),
            { status: 429, headers: { "Retry-After": "60" } },
          ),
      },
    ),
    (e: unknown) =>
      e instanceof AdLibraryClientError &&
      e.serverCode === "ad_library_rate_limited" &&
      e.retryAfterMs === 60000 &&
      !e.message.includes("SECRET"),
  );
});
test("caller abort wins; no retries; malformed success rejected", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = searchAdLibrary(
    { keyword: "x" },
    {
      env: {},
      signal: controller.signal,
      fetch: async (_url, init) => {
        calls++;
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        );
      },
    },
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(
    searchAdLibrary(
      { keyword: "x" },
      { env: {}, fetch: async () => new Response("{}") },
    ),
    { code: "malformed" },
  );
});
test("live keyword and domain tools", { skip: !liveEnabled() }, async () => {
  const keyword = await searchAdLibrary({ keyword: "baby carrier" });
  assert.ok(keyword.ads.length);
  const domain = await adsForAdvertiser({ domain: "aquaroobabycarrier.com" });
  assert.ok(domain.ads.length);
  assert.equal(domain.resolved_page?.page_id, "1178655808982200");
});

test("HTTP timer preserves the ten-second margin at 180 seconds", async (t) => {
  const original = globalThis.setTimeout;
  let observed = 0;
  t.mock.method(
    globalThis,
    "setTimeout",
    (callback: (...args: any[]) => void, ms: number) => {
      observed = ms;
      return original(callback, ms);
    },
  );
  await searchAdLibrary(
    { keyword: "x", timeout_ms: 180000 },
    {
      env: { DISCOVERY_AD_LIBRARY_TIMEOUT_MS: "100" },
      fetch: async () => new Response(JSON.stringify(result)),
    },
  );
  assert.equal(observed, 190000);
});
test("tool failures surface isError and sanitized server metadata", async (t) => {
  const { executeAdLibrary } = await import("../src/ad-library-tools.js");
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: { code: "ad_library_disabled", request_id: "safe" },
        }),
        { status: 401 },
      ),
  );
  const output = await executeAdLibrary({ keyword: "x" });
  assert.equal(output.isError, true);
  assert.equal(
    (output.details as { error: { serverCode: string } }).error.serverCode,
    "ad_library_disabled",
  );
});
