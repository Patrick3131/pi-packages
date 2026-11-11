import assert from "node:assert/strict";
import { test } from "node:test";
import { isAmazonEnabledByEnv, resolveAmazonConfig } from "../src/config.js";
import {
  getAmazonProduct,
  newAmazonReleases,
  searchAmazon,
  AmazonClientError,
} from "../src/amazon.js";
import {
  amazonNewReleasesRequest,
  amazonProductRequest,
  amazonSearchRequest,
  parseAmazonListingResponse,
  parseAmazonProductResponse,
} from "../src/amazon-validation.js";
import {
  formatAmazonListing,
  formatAmazonProduct,
} from "../src/amazon-format.js";
import {
  cachedNewReleasesResponse,
  newReleasesResponse,
  productResponse,
  recordingFetch,
  searchResponse,
  usage,
} from "./amazon-fixtures.js";

const invalidRequest = (error: unknown) =>
  error instanceof AmazonClientError && error.code === "invalid_request";
const malformed = (error: unknown) =>
  error instanceof AmazonClientError && error.code === "malformed";

test("Amazon tools are default-off and accept 1/true only", () => {
  assert.equal(isAmazonEnabledByEnv({}), false);
  assert.equal(isAmazonEnabledByEnv({ DISCOVERY_AMAZON_ENABLED: "" }), false);
  assert.equal(isAmazonEnabledByEnv({ DISCOVERY_AMAZON_ENABLED: "0" }), false);
  assert.equal(
    isAmazonEnabledByEnv({ DISCOVERY_AMAZON_ENABLED: "false" }),
    false,
  );
  assert.equal(isAmazonEnabledByEnv({ DISCOVERY_AMAZON_ENABLED: "1" }), true);
  assert.equal(
    isAmazonEnabledByEnv({ DISCOVERY_AMAZON_ENABLED: "TRUE " }),
    true,
  );
});

test("Amazon config resolves the VPN origin with a 40000 ms HTTP floor", () => {
  assert.deepEqual(resolveAmazonConfig({}), {
    baseUrl: "http://10.8.0.1:18080",
    timeoutMs: 40000,
  });
  assert.equal(
    resolveAmazonConfig({ DISCOVERY_AMAZON_TIMEOUT_MS: "90000" }).timeoutMs,
    90000,
  );
  for (const value of ["0", "-1", "1.5", "abc"])
    assert.throws(() =>
      resolveAmazonConfig({ DISCOVERY_AMAZON_TIMEOUT_MS: value }),
    );
  assert.throws(() =>
    resolveAmazonConfig({ DISCOVERY_BASE_URL: "http://10.8.0.1:18080/api" }),
  );
});

test("New Releases requests carry a department node and one page", () => {
  assert.deepEqual(amazonNewReleasesRequest({}), {
    endpoint: "/v1/amazon/new-releases",
    body: { page: 1, timeout_ms: 30000 },
    serverTimeoutMs: 30000,
    source: "new_releases",
    page: 1,
  });
  assert.deepEqual(
    amazonNewReleasesRequest({
      node: " baby-products/166764011 ",
      page: 5,
      timeout_ms: 5000,
    }).body,
    { node: "baby-products/166764011", page: 5, timeout_ms: 5000 },
  );
  for (const params of [
    { node: "baby-products/abc" },
    { node: "Baby Products" },
    { node: "baby-products/1667640110000" },
    { node: "x".repeat(65) },
    { node: 42 },
    { page: 0 },
    { page: 6 },
    { page: 1.5 },
    { page: "1" },
    { timeout_ms: 4999 },
    { timeout_ms: 60001 },
    { timeout_ms: 30000.5 },
    { keyword: "x" },
    { asin: "B0HQZCTBPW" },
  ])
    assert.throws(
      () => amazonNewReleasesRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );
});

test("search requests reject a bare department slug and bound the keyword", () => {
  assert.deepEqual(amazonSearchRequest({ keyword: "  baby stroller  " }), {
    endpoint: "/v1/amazon/search",
    body: {
      keyword: "baby stroller",
      page: 1,
      sort: "newest",
      timeout_ms: 30000,
    },
    serverTimeoutMs: 30000,
    source: "search",
    page: 1,
  });
  for (const node of ["166764011", "baby-products/166764011"])
    assert.equal(amazonSearchRequest({ keyword: "x", node }).body.node, node);
  assert.deepEqual(
    amazonSearchRequest({
      keyword: "x",
      node: "166764011",
      page: 2,
      sort: "relevance",
      timeout_ms: 5000,
    }).body,
    {
      keyword: "x",
      node: "166764011",
      page: 2,
      sort: "relevance",
      timeout_ms: 5000,
    },
  );
  for (const params of [
    {},
    { keyword: "" },
    { keyword: "   " },
    { keyword: "x".repeat(121) },
    { keyword: "bad\nkeyword" },
    { keyword: 42 },
    { keyword: "x", node: "baby-products" },
    { keyword: "x", node: 123 },
    { keyword: "x", page: 6 },
    { keyword: "x", sort: "price" },
    { keyword: "x", timeout_ms: 4999 },
    { keyword: "x", max_ads: 10 },
  ])
    assert.throws(
      () => amazonSearchRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );
});

test("product requests canonicalize one ASIN selector", () => {
  assert.deepEqual(amazonProductRequest({ asin: " b0hqzcTBPW " }), {
    endpoint: "/v1/amazon/product",
    body: { asin: "B0HQZCTBPW", timeout_ms: 30000 },
    serverTimeoutMs: 30000,
    asin: "B0HQZCTBPW",
  });
  for (const params of [
    {},
    { asin: "B0HQZCTBP" },
    { asin: "B0HQZCTBPWX" },
    { asin: "B0HQZCT-PW" },
    { asin: 42 },
    { asin: "B0HQZCTBPW", node: "baby-products" },
    { asin: "B0HQZCTBPW", timeout_ms: 60001 },
  ])
    assert.throws(
      () => amazonProductRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );
});

test("one call per intent posts exactly to its route with no retry", async () => {
  const env = { DISCOVERY_BASE_URL: "https://discovery.example" };

  const releases = recordingFetch(newReleasesResponse);
  const listing = await newAmazonReleases(
    { node: "baby-products", page: 1 },
    { env, fetch: releases.fetch },
  );
  assert.equal(listing.items.length, 2);
  assert.deepEqual(releases.calls, [
    {
      url: "https://discovery.example/v1/amazon/new-releases",
      body: { node: "baby-products", page: 1, timeout_ms: 30000 },
    },
  ]);

  const search = recordingFetch(searchResponse);
  const found = await searchAmazon(
    { keyword: "baby stroller", sort: "relevance" },
    { env, fetch: search.fetch },
  );
  assert.equal(found.keyword, "baby stroller");
  assert.deepEqual(search.calls, [
    {
      url: "https://discovery.example/v1/amazon/search",
      body: {
        keyword: "baby stroller",
        page: 1,
        sort: "relevance",
        timeout_ms: 30000,
      },
    },
  ]);

  const product = recordingFetch(productResponse);
  const detail = await getAmazonProduct(
    { asin: "b0hqzcTBPW" },
    { env, fetch: product.fetch },
  );
  assert.equal(detail.product.asin, "B0HQZCTBPW");
  assert.deepEqual(product.calls, [
    {
      url: "https://discovery.example/v1/amazon/product",
      body: { asin: "B0HQZCTBPW", timeout_ms: 30000 },
    },
  ]);
});

test("HTTP budget is max(floor, effective server budget + 10 s)", async (t) => {
  const original = globalThis.setTimeout;
  const observed: number[] = [];
  t.mock.method(
    globalThis,
    "setTimeout",
    (callback: (...args: never[]) => void, ms: number) => {
      observed.push(ms);
      return original(callback, ms);
    },
  );
  await newAmazonReleases(
    { timeout_ms: 30000 },
    {
      env: { DISCOVERY_AMAZON_TIMEOUT_MS: "100" },
      fetch: recordingFetch(newReleasesResponse).fetch,
    },
  );
  await getAmazonProduct(
    { asin: "B0HQZCTBPW", timeout_ms: 5000 },
    {
      env: { DISCOVERY_AMAZON_TIMEOUT_MS: "100" },
      fetch: recordingFetch(productResponse).fetch,
    },
  );
  await searchAmazon(
    { keyword: "x", timeout_ms: 60000 },
    {
      env: { DISCOVERY_AMAZON_TIMEOUT_MS: "120000" },
      fetch: recordingFetch(searchResponse).fetch,
    },
  );
  assert.deepEqual(observed, [40000, 15000, 120000]);
});

test("unresolved or invalid Discovery configuration fails safely", async () => {
  for (const env of [
    { DISCOVERY_BASE_URL: "http://user:pass@10.8.0.1:18080" },
    { DISCOVERY_BASE_URL: "http://10.8.0.1:18080/api" },
    { DISCOVERY_AMAZON_TIMEOUT_MS: "0" },
    { DISCOVERY_AMAZON_TIMEOUT_MS: "abc" },
  ])
    await assert.rejects(
      newAmazonReleases(
        {},
        { env, fetch: recordingFetch(newReleasesResponse).fetch },
      ),
      invalidRequest,
      JSON.stringify(env),
    );
});

test("server errors keep sanitized codes, reasons, usage and Retry-After", async () => {
  const cases: Array<[number, string, string, string | undefined]> = [
    [400, "amazon_invalid_request", "invalid_request", undefined],
    [401, "amazon_disabled", "disabled", undefined],
    [404, "amazon_not_found", "not_found", "delisted"],
    [429, "amazon_queue_full", "queue_full", undefined],
    [502, "amazon_blocked", "blocked", "browser_check"],
    [502, "amazon_upstream", "upstream", "layout_change"],
    [504, "amazon_timeout", "timeout", "deadline"],
  ];
  for (const [status, code, clientCode, reason] of cases) {
    const recorded = recordingFetch(
      {
        error: {
          code,
          message: "RAW UPSTREAM TEXT",
          request_id: "safe-id",
          ...(reason === undefined ? {} : { reason }),
        },
        usage,
      },
      {
        status,
        headers: status === 429 ? { "Retry-After": "1" } : undefined,
      },
    );
    await assert.rejects(
      newAmazonReleases({}, { env: {}, fetch: recorded.fetch }),
      (error: unknown) =>
        error instanceof AmazonClientError &&
        error.code === clientCode &&
        error.status === status &&
        error.serverCode === code &&
        error.requestId === "safe-id" &&
        error.reason === reason &&
        error.retryAfterMs === (status === 429 ? 1000 : undefined) &&
        error.usage?.wire_bytes === usage.wire_bytes &&
        !error.message.includes("RAW UPSTREAM"),
      `${status} ${code}`,
    );
    assert.equal(recorded.calls.length, 1, `${status} ${code} retried`);
  }
});

test("unknown codes, non-429 Retry-After and missing envelopes stay safe", async () => {
  await assert.rejects(
    searchAmazon(
      { keyword: "x" },
      {
        env: {},
        fetch: recordingFetch(
          {
            error: {
              code: "unexpected_code",
              message: "RAW",
              request_id: "safe",
              reason: "Upstream page text.",
            },
          },
          { status: 500, headers: { "Retry-After": "5" } },
        ).fetch,
      },
    ),
    (error: unknown) =>
      error instanceof AmazonClientError &&
      error.code === "upstream" &&
      error.serverCode === undefined &&
      error.status === 500 &&
      error.retryAfterMs === undefined &&
      error.reason === undefined &&
      error.usage === undefined,
  );

  await assert.rejects(
    getAmazonProduct(
      { asin: "B0HQZCTBPW" },
      {
        env: {},
        fetch: recordingFetch(
          { error: { code: "amazon_timeout", message: "RAW" } },
          { status: 504, headers: { "Retry-After": "30" } },
        ).fetch,
      },
    ),
    (error: unknown) =>
      error instanceof AmazonClientError &&
      error.code === "timeout" &&
      error.requestId === undefined &&
      error.retryAfterMs === undefined,
  );

  await assert.rejects(
    newAmazonReleases(
      {},
      {
        env: {},
        fetch: recordingFetch("not an envelope", { status: 502 }).fetch,
      },
    ),
    (error: unknown) =>
      error instanceof AmazonClientError &&
      error.code === "upstream" &&
      error.status === 502,
  );
});

test("success bodies must satisfy the amazon.v1 wire contract", async () => {
  for (const body of [
    { ...newReleasesResponse, schema_version: "amazon.v2" },
    { ...newReleasesResponse, source: "search" },
    { ...newReleasesResponse, page: 2 },
    { ...newReleasesResponse, item_count: 3 },
    { ...newReleasesResponse, item_count: 1 },
    { ...newReleasesResponse, items: "nope" },
    { ...newReleasesResponse, usage: undefined },
    { ...newReleasesResponse, usage: { ...usage, requests: -1 } },
    { ...newReleasesResponse, fetched_at: "yesterday" },
    { ...newReleasesResponse, cached: "no" },
    {
      ...newReleasesResponse,
      items: [newReleasesResponse.items[0], newReleasesResponse.items[0]],
    },
    {
      ...newReleasesResponse,
      items: [{ ...newReleasesResponse.items[0], asin: "short" }],
    },
    {
      ...newReleasesResponse,
      items: [{ ...newReleasesResponse.items[0], title: "" }],
    },
    {
      ...newReleasesResponse,
      items: [{ ...newReleasesResponse.items[0], rating: 6 }],
    },
    {
      ...newReleasesResponse,
      items: [{ ...newReleasesResponse.items[0], rank_position: 0 }],
    },
    {
      ...newReleasesResponse,
      items: [
        {
          ...newReleasesResponse.items[0],
          product_url: "https://evil.example",
        },
      ],
      item_count: 1,
    },
    {
      ...newReleasesResponse,
      items: [{ ...newReleasesResponse.items[0], source: "search" }],
      item_count: 1,
    },
  ])
    await assert.rejects(
      newAmazonReleases({}, { env: {}, fetch: recordingFetch(body).fetch }),
      malformed,
      JSON.stringify(body),
    );

  await assert.rejects(
    newAmazonReleases(
      { page: 2 },
      { env: {}, fetch: recordingFetch(newReleasesResponse).fetch },
    ),
    malformed,
  );

  for (const body of [
    { ...productResponse, schema_version: "amazon.v2" },
    { ...productResponse, product: null },
    { ...productResponse, usage: undefined },
    {
      ...productResponse,
      product: { ...productResponse.product, asin: "SHORT" },
    },
    {
      ...productResponse,
      product: {
        ...productResponse.product,
        date_first_available: "Sept 2026",
      },
    },
    {
      ...productResponse,
      product: { ...productResponse.product, variation_count: 0 },
    },
    {
      ...productResponse,
      product: { ...productResponse.product, best_sellers_rank: [{ rank: 0 }] },
    },
    {
      ...productResponse,
      product: { ...productResponse.product, warnings: ["Date Missing!"] },
    },
    {
      ...productResponse,
      product: { ...productResponse.product, source: "pdp2" },
    },
  ])
    await assert.rejects(
      getAmazonProduct(
        { asin: "B0HQZCTBPW" },
        { env: {}, fetch: recordingFetch(body).fetch },
      ),
      malformed,
      JSON.stringify(body),
    );

  await assert.rejects(
    getAmazonProduct(
      { asin: "B0HQZCTBPW" },
      {
        env: {},
        fetch: recordingFetch({
          ...productResponse,
          product: { ...productResponse.product, asin: "B0OTHER001" },
        }).fetch,
      },
    ),
    malformed,
  );

  await assert.rejects(
    newAmazonReleases(
      {},
      { env: {}, fetch: recordingFetch(undefined, { text: "not json" }).fetch },
    ),
    malformed,
  );
});

test("unknown additive fields survive parsing and cache hits report zero usage", () => {
  const additive = {
    ...newReleasesResponse,
    server_trace: "additive",
    items: [{ ...newReleasesResponse.items[0], launch_flag: true }],
    item_count: 1,
  };
  const parsed = parseAmazonListingResponse(additive, {
    source: "new_releases",
    page: 1,
  });
  assert.equal((parsed as Record<string, unknown>).server_trace, "additive");
  assert.equal((parsed.items[0] as Record<string, unknown>).launch_flag, true);

  const cached = parseAmazonListingResponse(cachedNewReleasesResponse, {
    source: "new_releases",
    page: 1,
  });
  assert.equal(cached.cached, true);
  assert.equal(cached.usage.requests, 0);
  assert.match(formatAmazonListing(cached).text, /served from cache/);

  const product = parseAmazonProductResponse(
    {
      ...productResponse,
      product: { ...productResponse.product, seller_rating: 98 },
    },
    "B0HQZCTBPW",
  );
  assert.equal((product.product as Record<string, unknown>).seller_rating, 98);
});

test("a timed-out exchange cleans up and never retries", async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  let observed = 0;
  t.mock.method(
    globalThis,
    "setTimeout",
    (callback: (...args: never[]) => void, ms: number) => {
      observed = ms;
      queueMicrotask(callback);
      return originalSetTimeout(() => {}, 0);
    },
  );
  let calls = 0;
  await assert.rejects(
    newAmazonReleases(
      {},
      {
        env: { DISCOVERY_AMAZON_TIMEOUT_MS: "100" },
        fetch: ((_url: string, init?: RequestInit) => {
          calls++;
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("raw transport text")),
            );
          });
        }) as unknown as typeof fetch,
      },
    ),
    (error: unknown) =>
      error instanceof AmazonClientError &&
      error.code === "timeout" &&
      !error.message.includes("raw transport text"),
  );
  assert.equal(observed, 40000);
  assert.equal(calls, 1);
});

test("caller abort wins before and during the fetch", async () => {
  let calls = 0;
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    newAmazonReleases(
      {},
      {
        env: {},
        signal: preAborted.signal,
        fetch: (async () => {
          calls++;
          return new Response(JSON.stringify(newReleasesResponse));
        }) as unknown as typeof fetch,
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);

  const controller = new AbortController();
  const pending = getAmazonProduct(
    { asin: "B0HQZCTBPW" },
    {
      env: {},
      signal: controller.signal,
      fetch: ((_url: string, init?: RequestInit) => {
        calls++;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        });
      }) as unknown as typeof fetch,
    },
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
});

test("transport failures stay sanitized", async () => {
  await assert.rejects(
    searchAmazon(
      { keyword: "x" },
      {
        env: {},
        fetch: (async () => {
          throw new Error("socket details");
        }) as unknown as typeof fetch,
      },
    ),
    (error: unknown) =>
      error instanceof AmazonClientError &&
      error.code === "transport" &&
      !error.message.includes("socket details"),
  );
});

test("New Releases text states the byline/date and usage caveats", () => {
  const formatted = formatAmazonListing(newReleasesResponse);
  assert.match(
    formatted.text,
    /Amazon New Releases · node baby-products · page 1 · 2 items/,
  );
  assert.match(formatted.text, /B0HQZCTBPW/);
  assert.match(formatted.text, /brand: none on New Releases \(no byline\)/);
  assert.match(formatted.text, /\$249\.99/);
  assert.match(formatted.text, /4\.6\/5 \(812 reviews\)/);
  assert.match(formatted.text, /position #3/);
  assert.match(formatted.text, /https:\/\/www\.amazon\.com\/dp\/B0HQZCTBPW/);
  assert.match(formatted.text, /no byline or date/i);
  assert.match(formatted.text, /cannot date a launch by itself/i);
  assert.match(formatted.text, /never retries/i);
  assert.match(formatted.text, /~119000 wire bytes \(gzip estimate\)/);
  assert.match(formatted.text, /241000 decoded bytes · 1 request/);
  assert.ok(formatted.text.length <= 12000);
  assert.deepEqual(formatted.details.response, newReleasesResponse);
});

test("search text is discovery-only and wire_incomplete is surfaced", () => {
  const formatted = formatAmazonListing({
    ...searchResponse,
    usage: { ...usage, wire_incomplete: true },
  });
  assert.match(formatted.text, /Amazon newest-sorted search · "baby stroller"/);
  assert.match(formatted.text, /discovery only, not a launch signal/i);
  assert.match(formatted.text, /wire bytes incomplete/);
  assert.doesNotMatch(formatted.text, /no byline or date/);
  assert.match(formatted.text, /brand ExampleBrand/);
  assert.match(formatted.text, /sponsored/);
});
test("search text labels relevance, listing position and tri-state sponsorship", () => {
  const relevance = formatAmazonListing(searchResponse, { sort: "relevance" });
  assert.match(relevance.text, /Amazon relevance-sorted search/);
  assert.doesNotMatch(relevance.text, /newest-sorted search/);
  assert.doesNotMatch(relevance.text, /order churns/);
  assert.match(relevance.text, /not a launch signal/);

  const formatted = formatAmazonListing({
    ...searchResponse,
    items: [
      {
        ...searchResponse.items[0],
        rank_position: 31,
        sponsored: null,
        rating: null,
        review_count: 1,
      },
    ],
    item_count: 1,
  });
  assert.match(formatted.text, /position #31/);
  assert.doesNotMatch(formatted.text, /rank #31/);
  assert.match(formatted.text, /sponsored unknown/);
  assert.match(formatted.text, /rating not shown · 1 review\b/);
  assert.doesNotMatch(formatted.text, /1 reviews/);
  assert.match(formatted.text, /position is not a sales rank/);
});

test("listing text stays bounded and labels shortened previews", () => {
  const items = Array.from({ length: 60 }, (_, index) => ({
    ...newReleasesResponse.items[0],
    asin: `B0${String(index).padStart(8, "0")}`,
    title: `A deliberately long product title ${index} `.repeat(4),
  }));
  const formatted = formatAmazonListing({
    ...newReleasesResponse,
    items,
    item_count: items.length,
  });
  assert.ok(formatted.text.length <= 12000);
  assert.match(formatted.text, /Text previews shortened: showing 25\/60 items/);
  assert.match(formatted.text, /never retries/i);
  assert.equal(formatted.details.response?.items.length, 60);
});

test("empty listing pages stay explicit, not errors", () => {
  const formatted = formatAmazonListing({
    ...newReleasesResponse,
    items: [],
    item_count: 0,
    page: 5,
  });
  assert.match(formatted.text, /No items on this page/);
  assert.match(formatted.text, /not an error/);
});

test("product text labels sparse date evidence, variations and warnings", () => {
  const formatted = formatAmazonProduct({
    ...productResponse,
    product: {
      ...productResponse.product,
      warnings: ["variation_unknown"],
      bullet_points: Array.from({ length: 8 }, (_, index) => `Bullet ${index}`),
    },
  });
  assert.match(formatted.text, /Amazon product B0HQZCTBPW/);
  assert.match(
    formatted.text,
    /Brand: ExampleBaby · Manufacturer: ExampleBaby Inc\./,
  );
  assert.match(formatted.text, /Date first available: 2026-09-14/);
  assert.match(formatted.text, /Variation: parent B0HQZCTBPW · count 4/);
  assert.match(formatted.text, /#912 in Baby Strollers/);
  assert.match(formatted.text, /showing 5\/8 bullet points/);
  assert.match(formatted.text, /Warnings: variation_unknown/);
  assert.match(formatted.text, /sparse provider evidence/i);
  assert.match(formatted.text, /first-seen sweep diffs/);
  assert.match(formatted.text, /never retries/);
  assert.match(formatted.text, /119000 wire bytes/);
  assert.ok(formatted.text.length <= 12000);
});

test("product text renders null signals as unknown, never no", () => {
  const formatted = formatAmazonProduct({
    ...productResponse,
    product: {
      ...productResponse.product,
      has_brand_store: null,
      has_video: null,
      subscription_available: null,
    },
  });
  assert.match(
    formatted.text,
    /brand store unknown, video unknown, subscription unknown/,
  );
});

test("product text shows missing provider facts as not shown, never invented", () => {
  const formatted = formatAmazonProduct({
    ...productResponse,
    cached: true,
    usage: {
      decoded_bytes: 0,
      wire_bytes: 0,
      wire_estimated: false,
      requests: 0,
    },
    product: {
      ...productResponse.product,
      brand: null,
      manufacturer: null,
      seller_name: null,
      price: null,
      price_amount: null,
      date_first_available: null,
      category_path: [],
      best_sellers_rank: [],
      bullet_points: [],
    },
  });
  assert.match(formatted.text, /Brand: not shown · Manufacturer: not shown/);
  assert.match(formatted.text, /Price: price not shown/);
  assert.match(formatted.text, /Date first available: not shown/);
  assert.match(formatted.text, /Category: not shown/);
  assert.match(formatted.text, /Best sellers rank: not shown/);
  assert.match(formatted.text, /Bullets: none returned/);
  assert.match(formatted.text, /served from cache/);
  assert.match(formatted.text, /cached/);
});
