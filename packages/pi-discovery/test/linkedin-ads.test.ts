import assert from "node:assert/strict";
import test from "node:test";
import {
  getLinkedInAdDetail,
  searchLinkedInAds,
  formatLinkedInAds,
} from "../src/features/ad-library/platforms/linkedin/client.js";
import type { LinkedInAdsResult } from "../src/features/ad-library/platforms/linkedin/schema.js";

const result: LinkedInAdsResult = {
  provider: "linkedin_ad_library",
  id: "request",
  mode: "keyword",
  query: "cloud",
  country: "ALL",
  date_option: null,
  sort: "newest",
  ads: [],
  total_ads: null,
  advertisers: [],
  max_ads_adjustment: { requested: 5, effective: 24 },
  next_cursor: null,
  cap_reason: null,
  dropped: 0,
  complete: true,
  partial: false,
  truncated: false,
  truncation: [],
  pages: [],
  failed_pages: [],
  transparency: null,
  timings: { queue_ms: 0, upstream_ms: 10, total_ms: 11 },
};

test("LinkedIn uses its own endpoint and preserves provider receipts", async () => {
  const params = {
    keyword: "cloud",
    country: "ALL",
    cursor: "opaque",
    max_ads: 5,
    include_transparency: true,
  };
  const output = await searchLinkedInAds(params, {
    fetch: async (url, init) => {
      assert.equal(
        new URL(String(url)).pathname,
        "/v1/ad-library/linkedin/search",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), params);
      return Response.json(result);
    },
  });
  assert.deepEqual(output, result);
  assert.match(formatLinkedInAds(output).text, /raised to 24/);
});

test("Pi waits past the default LinkedIn search deadline and honors explicit budgets", async (t) => {
  const setTimer = globalThis.setTimeout;
  const timers: number[] = [];
  t.mock.method(
    globalThis,
    "setTimeout",
    (callback: () => void, ms: number) => {
      timers.push(ms);
      return setTimer(callback, ms);
    },
  );
  const options = {
    env: { DISCOVERY_AD_LIBRARY_TIMEOUT_MS: "100" },
    fetch: async () => Response.json(result),
  };
  await searchLinkedInAds({ keyword: "cloud", max_ads: 5 }, options);
  await searchLinkedInAds(
    { keyword: "cloud", max_ads: 5, timeout_ms: 60000 },
    options,
  );
  assert.deepEqual(timers, [190000, 70000]);
});

test("LinkedIn rejects crossed providers, invalid selectors and mismatched caps", async () => {
  const fetch = async () => Response.json(result);
  for (const params of [
    {},
    { cursor: "token" },
    { keyword: "k", page_id: "1" },
    { domain: "x.com" },
  ])
    await assert.rejects(
      searchLinkedInAds(params, { fetch }),
      /invalid_request/,
    );
  await assert.rejects(
    searchLinkedInAds({ keyword: "k", max_ads: 6 }, { fetch }),
    /malformed/,
  );
  await assert.rejects(
    searchLinkedInAds(
      { keyword: "k" },
      {
        fetch: async () =>
          Response.json({ ...result, provider: "meta_ad_library" }),
      },
    ),
    /malformed/,
  );
});

const ad = {
  ad_id: "42",
  creative_type: null,
  format: null,
  media_type: null,
  advertiser: {
    name: "Example",
    page_id: null,
    page_url: null,
    logo_url: null,
  },
  promoted: null,
  author: null,
  commentary: "A full ad",
  commentary_truncated: false,
  headline: null,
  cta: null,
  image: null,
  video_poster_url: null,
  carousel: [],
  destination_url: null,
  detail_url: "https://www.linkedin.com/ad-library/detail/42",
  transparency: null,
};
test("known ad lookup validates the response ID", async () => {
  const fetch = async () =>
    Response.json({ id: "receipt", provider: "linkedin_ad_library", ad });
  assert.deepEqual(
    (await getLinkedInAdDetail({ ad_id: "42" }, { fetch })).ad,
    ad,
  );
  await assert.rejects(
    getLinkedInAdDetail({ ad_id: "43" }, { fetch }),
    /malformed/,
  );
});

test("keyword preview shows distinct advertisers and matching copy while preserving the response", () => {
  const ads = ["A", "A", "A", "B", "C", "D", "E"].map((name, index) => ({
    ...ad,
    ad_id: String(index),
    detail_url: "https://www.linkedin.com/ad-library/detail/" + index,
    advertiser: { ...ad.advertiser, name },
    commentary: "x".repeat(500) + " payroll software",
    commentary_truncated: true,
  }));
  const page = { ...result, ads };
  const preview = formatLinkedInAds(page, false, {
    keyword: "payroll software",
  });
  assert.deepEqual(
    [...preview.text.matchAll(/detail\/(\d+)/g)].map((m) => m[1]),
    ["0", "3", "4", "5", "6"],
  );
  assert.match(preview.text, /payroll software.*commentary shortened/i);
  assert.strictEqual(preview.details, page);
  assert.deepEqual(
    page.ads.map((a) => a.ad_id),
    ["0", "1", "2", "3", "4", "5", "6"],
  );
  for (const params of [{ page_id: "1" }, { account_owner: "A" }]) {
    const text = formatLinkedInAds(page, false, params).text;
    assert.deepEqual(
      [...text.matchAll(/detail\/(\d+)/g)].map((m) => m[1]),
      ["0", "1", "2", "3", "4"],
    );
  }
});
