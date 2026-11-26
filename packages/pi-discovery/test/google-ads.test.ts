import assert from "node:assert/strict";
import test from "node:test";
import {
  searchGoogleAds,
  formatGoogleAds,
} from "../src/features/ad-library/platforms/google/client.js";
import type {
  GoogleAdsResult,
  GoogleAdsParams,
} from "../src/features/ad-library/platforms/google/schema.js";
import { liveEnabled, resolveAdLibraryConfig } from "../src/config.js";

const result: GoogleAdsResult = {
  id: "receipt",
  provider: "google_ads_transparency",
  mode: "domain",
  query: "thehoopsgeek.com",
  country: "anywhere",
  media_type: "all",
  total_ad_count: 5,
  copy_unparsed: 0,
  max_ads_adjustment: null,
  next_cursor: null,
  complete: true,
  partial: false,
  retry_after_s: null,
  ads: [
    {
      archive_id: "CR17824774715521105921",
      advertiser_id: "AR17325718069984624641",
      advertiser_name: "Andreas Rauh",
      format: "text",
      format_code: 1,
      first_shown: "2026-11-04",
      last_shown: "2026-11-25",
      days_shown: 22,
      domain: "thehoopsgeek.com",
      variants: [{ preview_url: "https://example.com/preview", image_url: null, height: null, width: null }],
      ad_copy: {
        headline: "Animated Basketball Playbook",
        description: "Draw plays on a real court.",
        display_url: "app.thehoopsgeek.com/play-creator",
        extras: ["Pricing", "Team Plans"],
        truncated: false,
      },
      creative_truncated: false,
    },
    {
      archive_id: "CR17842724715521105922",
      advertiser_id: "AR17325718069984624641",
      advertiser_name: "Andreas Rauh",
      format: "image",
      format_code: 2,
      first_shown: "2026-11-10",
      last_shown: "2026-11-20",
      days_shown: 11,
      domain: "thehoopsgeek.com",
      variants: [{ preview_url: null, image_url: "https://example.com/img.png", height: 628, width: 1200 }],
      ad_copy: null,
      creative_truncated: false,
    },
  ],
  pages: [
    {
      page: 1,
      http_status: 200,
      groups: 2,
      ads: 2,
      returned: 2,
      response_sha256: "a".repeat(64),
    },
  ],
  failed_pages: [],
  truncation: [],
  truncated: false,
  timings: { queue_ms: 0, upstream_ms: 10, total_ms: 11 },
};

test("Google uses its own endpoint, defaults and hostname normalization", async () => {
  const requests: Record<string, unknown>[] = [];
  const output = await searchGoogleAds(
    { domain: "WWW.TheHoopsGeek.com " },
    {
      fetch: async (url, init) => {
        assert.equal(new URL(String(url)).pathname, "/v1/ad-library/google/search");
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        return Response.json(result);
      },
    },
  );
  assert.deepEqual(output, result);
  assert.deepEqual(requests.at(-1), {
    domain: "thehoopsgeek.com",
    country: "anywhere",
    media_type: "all",
    max_ads: 40,
    timeout_ms: 120000,
  });
});

test("Google accepts advertiser ids and region filters", async () => {
  const requests: Record<string, unknown>[] = [];
  await searchGoogleAds(
    {
      advertiser_id: "AR17325718069984624641",
      country: " ANYwhere ",
      media_type: "video",
      max_ads: 120,
      timeout_ms: 60000,
      cursor: "opaque+token",
    },
    {
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ ...result, mode: "advertiser", query: "AR17325718069984624641" });
      },
    },
  );
  assert.deepEqual(requests.at(-1), {
    advertiser_id: "AR17325718069984624641",
    country: "anywhere",
    media_type: "video",
    max_ads: 120,
    timeout_ms: 60000,
    cursor: "opaque+token",
  });
  await searchGoogleAds(
    { domain: "x.com", country: "de" },
    {
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ ...result, ads: [], pages: [] });
      },
    },
  );
  assert.match(JSON.stringify(requests.at(-1)), /"country":"DE"/);
});

test("Google rejects crossed selectors, bad ids and foreign fields", async () => {
  const fetch = async () => Response.json(result);
  for (const params of [
    {},
    { domain: "x.com", advertiser_id: "AR17325718069984624641" },
    { advertiser_id: "AR123" },
    { advertiser_id: "page1" },
    { domain: "no-dot" },
    { domain: "x.com", keyword: "k" },
    { domain: "x.com", active_only: true },
    { domain: "x.com", media_type: "html" },
    { domain: "x.com", max_ads: 0 },
    { domain: "x.com", timeout_ms: 1000 },
    { domain: "x.com", cursor: "bad\tcursor" },
    { domain: "x.com", country: "ALL" },
  ] as const)
    await assert.rejects(searchGoogleAds(params as GoogleAdsParams, { fetch }), /invalid_request/);
});

test("Google validates provider identity, caps and adjustment consistency", async () => {
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com" },
      { fetch: async () => Response.json({ ...result, provider: "meta_ad_library" }) },
    ),
    /malformed/,
  );
  // A cap raised to 300 must not claim a sub-page adjustment.
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com", max_ads: 300 },
      {
        fetch: async () =>
          Response.json({
            ...result,
            max_ads_adjustment: { requested: 40, effective: 40 },
          }),
      },
    ),
    /malformed/,
  );
  // Repeated archive ids are a lie about distinct delivered ads.
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com" },
      {
        fetch: async () =>
          Response.json({ ...result, ads: [...result.ads, result.ads[0]] }),
      },
    ),
    /malformed/,
  );
  // requested < 40 must be disclosed through max_ads_adjustment
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com", max_ads: 10 },
      {
        fetch: async () =>
          Response.json({
            ...result,
            max_ads_adjustment: { requested: 9, effective: 40 },
          }),
      },
    ),
    /malformed/,
  );
  const adjusted = await searchGoogleAds(
    { domain: "x.com", max_ads: 10 },
    {
      fetch: async () =>
        Response.json({
          ...result,
          max_ads_adjustment: { requested: 10, effective: 40 },
        }),
    },
  );
  assert.deepEqual(adjusted.max_ads_adjustment, { requested: 10, effective: 40 });
});

test("Google rejects partial/truncated envelope lies", async () => {
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com" },
      {
        fetch: async () =>
          Response.json({ ...result, partial: true, failed_pages: [] }),
      },
    ),
    /malformed/,
  );
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com" },
      {
        fetch: async () =>
          Response.json({ ...result, truncated: true, truncation: [] }),
      },
    ),
    /malformed/,
  );
  await assert.rejects(
    searchGoogleAds(
      { domain: "x.com" },
      { fetch: async () => Response.json({ ...result, copy_unparsed: -1 }) },
    ),
    /malformed/,
  );
});

test("formatter shows decoded copy, visible-URL semantics and tripwires", () => {
  const formatted = formatGoogleAds(result, false, { domain: "thehoopsgeek.com" });
  assert.match(formatted.text, /Google ads · 2 ads returned · domain: thehoopsgeek\.com/);
  assert.match(formatted.text, /declares 5 total ads; advisory only/);
  assert.match(formatted.text, /Headline: Animated Basketball Playbook/);
  assert.match(formatted.text, /Sitelinks: Pricing \| Team Plans/);
  assert.match(formatted.text, /display only; Google publishes no click-through destination/);
  assert.match(formatted.text, /Image: https:\/\/example\.com\/img\.png/);
  assert.strictEqual(formatted.details, result);
  const drift = formatGoogleAds(
    { ...result, copy_unparsed: 2, ads: [] },
    false,
    { domain: "x.com" },
  );
  assert.match(drift.text, /2 ad\(s\) carry a preview overlay that did not decode/);
  assert.match(drift.text, /No ads found/);
  const failed = formatGoogleAds(
    {
      ...result,
      ads: [],
      pages: [],
      complete: false,
      partial: true,
      failed_pages: [
        { page: 2, error_code: "ad_library_upstream", reason: "http_status", http_status: 503, stage: "pagination" },
      ],
    },
    true,
  );
  assert.match(failed.text, /Page 2: pagination \(ad_library_upstream, http_status, HTTP 503\)/);
  assert.match(failed.text, /Incomplete sample\. No continuation token is available/);
  const continued = formatGoogleAds(
    {
      ...result,
      ads: [],
      pages: [],
      complete: false,
      next_cursor: "opaque",
      truncation: ["max_ads"],
      truncated: true,
    },
    true,
  );
  assert.match(continued.text, /Next: pass cursor="opaque"/);
  assert.match(continued.text, /Truncated: max_ads\./);
});

test("Google HTTP budget covers the 180s server default", async (t) => {
  const setTimer = globalThis.setTimeout;
  const timers: number[] = [];
  t.mock.method(globalThis, "setTimeout", (callback: () => void, ms: number) => {
    timers.push(ms);
    return setTimer(callback, ms);
  });
  const options = {
    env: { DISCOVERY_AD_LIBRARY_TIMEOUT_MS: "100" },
    fetch: async () => Response.json(result),
  };
  await searchGoogleAds({ domain: "x.com" }, options);
  await searchGoogleAds(
    { domain: "x.com", timeout_ms: 180000 },
    options,
  );
  assert.deepEqual(timers, [130000, 190000]);
});

test("live Google search returns a decodable overlay through the VPN bind", { skip: !liveEnabled() }, async () => {
  const config = resolveAdLibraryConfig();
  const live = await searchGoogleAds({ domain: "thehoopsgeek.com" }, {
    env: { DISCOVERY_BASE_URL: config.baseUrl },
  });
  assert.equal(live.provider, "google_ads_transparency");
  assert.equal(live.complete, true);
  assert.equal(live.copy_unparsed, 0);
  const withCopy = live.ads.find((ad) => ad.ad_copy);
  assert.ok(withCopy, "expected at least one ad with decoded copy");
  assert.equal(withCopy.ad_copy!.display_url, "app.thehoopsgeek.com/play-creator");
  assert.deepEqual(withCopy.ad_copy!.extras, ["Pricing", "Team Plans", "Design Basketball Drills"]);
});
