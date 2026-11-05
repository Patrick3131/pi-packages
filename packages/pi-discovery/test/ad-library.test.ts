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

test("resolution failures surface candidates and a retry hint", async (t) => {
  const { executeAdLibrary } = await import("../src/ad-library-tools.js");
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "ad_library_page_ambiguous",
            request_id: "safe",
            candidates: [
              {
                page_id: "106897735744942",
                page_name: "Elite Hoops App",
                votes: 1,
                ads: 4,
                landing_domains: ["elitehoopsapp.com"],
              },
            ],
            retry_with: { page_id: "106897735744942" },
            sample_truncated: true,
          },
        }),
        { status: 409 },
      ),
  );
  const output = await executeAdLibrary({ domain: "elitehoopsapp.com" });
  assert.equal(output.isError, false);
  const details = output.details as {
    status: string;
    error: { candidates: Array<{ page_id: string }>; retry_with: { page_id: string } };
  };
  assert.equal(details.status, "ambiguous");
  assert.equal(details.error.candidates[0].page_id, "106897735744942");
  assert.equal(details.error.retry_with.page_id, "106897735744942");
  assert.match(
    output.content[0].type === "text" ? output.content[0].text : "",
    /Retry with page_id=106897735744942/,
  );
});

test("summary leads with status filters and explains the truncation cause", () => {
  const formatted = formatAdLibrary({
    ...result,
    cap_reason: "ad_limit",
    advertisers: [
      {
        page_id: "2",
        page_name: "Brand",
        ads: 1,
        active: 1,
        landing_domains: ["brand.example"],
      },
    ],
  } as never);
  assert.match(formatted.summary, /US · active only/);
  assert.match(formatted.summary, /stopped at requested max_ads/);
  assert.match(formatted.text, /Brand \| page_id=2 \| domains=brand\.example \| ads=1/);
});

test("model-visible ads include domains, page IDs, copy and creative URLs", () => {
  const rich = {
    ...result,
    ads: [
      {
        archive_id: "1",
        page_id: "2",
        page_name: "Brand",
        landing_url: "https://brand.example/product",
        body: "Ad copy",
        headline: "Headline",
        images: [{ original_image_url: "https://cdn.example/image.jpg" }],
        videos: [
          {
            video_hd_url: "https://cdn.example/video.mp4",
            video_preview_image_url: "https://cdn.example/preview.jpg",
          },
        ],
        cards: [
          {
            headline: "Card product",
            body: "Card copy",
            landing_url: "https://shop.brand.example/card",
            resized_image_url: "https://cdn.example/card.jpg",
          },
        ],
      },
    ],
  } as Parameters<typeof formatAdLibrary>[0];
  const output = formatAdLibrary(rich);
  for (const text of [
    "brand.example",
    "page_id=2",
    "https://brand.example/product",
    "Ad copy",
    "Headline",
    "https://cdn.example/image.jpg",
    "https://cdn.example/video.mp4",
    "Card product",
    "https://shop.brand.example/card",
  ])
    assert.ok(output.text.includes(text), text);
  assert.match(output.text, /not total active-ad inventory/);
  const large = {
    ...rich,
    ads: Array.from({ length: 300 }, (_, i) => ({
      ...rich.ads[0],
      archive_id: String(i),
      page_id: String(i),
      body: "x".repeat(10000),
    })),
  };
  const bounded = formatAdLibrary(large);
  assert.ok(bounded.text.length < 32500);
  assert.match(bounded.text, /Text view shortened/);
  assert.equal(bounded.details.ads.length, 300);
});
test("native structured output preserves full ads and normal resolution outcomes", async (t) => {
  const { executeAdLibrary, registerAdLibrary } =
    await import("../src/ad-library-tools.js");
  const nativePayload = {
    ...result,
    ads: [
      {
        ...result.ads[0],
        images: [{ original_image_url: "https://cdn.example/image.jpg" }],
        videos: [{ video_sd_url: "https://cdn.example/video.mp4" }],
        cards: [
          {
            headline: "Card",
            landing_url: "https://brand.example/product",
            body: "Copy",
          },
        ],
      },
    ],
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(nativePayload)),
  );
  const success = await executeAdLibrary({ keyword: "x" });
  assert.equal((success.structuredContent as { ads: unknown[] }).ads.length, 1);
  const definitions: Array<{ name: string; outputSchema: unknown }> = [];
  registerAdLibrary({
    registerTool: (d: { name: string; outputSchema: unknown }) =>
      definitions.push(d),
  } as never);
  assert.equal(definitions.length, 2);
  assert.ok(definitions.every((d) => d.outputSchema));
  const { Check } = await import("typebox/value");
  assert.ok(
    Check(
      definitions[0].outputSchema as import("typebox").TSchema,
      success.structuredContent,
    ),
  );
  assert.equal(
    (success.structuredContent as { ads: Array<{ cards: unknown[] }> }).ads[0]
      .cards.length,
    1,
  );
  for (const [status, code, outcome] of [
    [404, "ad_library_page_not_found", "not_found"],
    [409, "ad_library_page_ambiguous", "ambiguous"],
  ] as const) {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code, request_id: "safe" } }), {
          status,
        }),
    );
    const output = await executeAdLibrary({ domain: "brand.example" });
    assert.equal(output.isError, false);
    assert.equal(
      (output.structuredContent as { status: string }).status,
      outcome,
    );
  }
});

test("dynamic copy shows representative provenance and hides unresolved legacy tokens", () => {
  const output = formatAdLibrary({
    ...result,
    ads: [
      {
        ...result.ads[0],
        headline: "Olive Tree",
        body: null,
        template_fields: ["headline", "body"],
        representative_card_index: 0,
        cards: [
          {
            headline: "Olive Tree",
            landing_url: "https://brand.example/olive-tree",
          },
        ],
      },
    ],
  } as never);
  assert.match(output.text, /Headline: Olive Tree/);
  assert.match(output.text, /representative creative card 1/);
  assert.match(
    output.text,
    /Representative card landing: https:\/\/brand.example\/olive-tree/,
  );
  const legacy = formatAdLibrary({
    ...result,
    ads: [{ ...result.ads[0], headline: "{{product.name}}" }],
  } as never);
  assert.doesNotMatch(legacy.text, /product.name/);
  assert.match(legacy.text, /unavailable: dynamic template/);
});

test("cursor is accepted only with a resumable selector", () => {
  const body = adLibraryRequest({ page_id: "123", cursor: "opaque:token-1" });
  assert.equal(body.cursor, "opaque:token-1");
  for (const params of [
    { domain: "a.com", cursor: "x" },
    { keyword: "x", cursor: "bad cursor" },
    { keyword: "x", cursor: "" },
    { keyword: "x", cursor: "a".repeat(65537) },
  ]) {
    assert.throws(
      () => adLibraryRequest(params as never),
      (e: Error) => e instanceof AdLibraryClientError && e.code === "invalid_request",
    );
  }
});

test("harvest state is rendered so a caller can continue", () => {
  const more = formatAdLibrary({
    ...result,
    truncation: ["page_cap"],
    truncated: true,
    complete: false,
    next_cursor: "opaque:token-1",
    dropped: 0,
  } as never);
  assert.match(more.text, /Next: pass cursor="opaque:token-1"/);
  const split = formatAdLibrary({
    ...result,
    truncation: ["ad_cap", "page_cap"],
    truncated: true,
    complete: false,
    next_cursor: "opaque:token-2",
    dropped: 4,
  } as never);
  assert.match(split.text, /Dropped: 4 ads from a split page/);
  const done = formatAdLibrary({ ...result, complete: true, next_cursor: null } as never);
  assert.doesNotMatch(done.text, /Next: pass cursor/);
});
