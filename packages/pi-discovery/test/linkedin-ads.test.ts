import assert from "node:assert/strict";
import test from "node:test";
import {
  getLinkedInAdDetail,
  searchLinkedInAds,
  formatLinkedInAds,
} from "../src/features/ad-library/linkedin.js";
import type { LinkedInAdsResult } from "../src/features/ad-library/linkedin-schema.js";

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

test("known ad lookup validates the response ID", async () => {
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
