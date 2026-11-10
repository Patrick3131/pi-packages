import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSocialPost,
  getSocialProfile,
  getSocialProfilePosts,
  SocialClientError,
} from "../src/social.js";
import {
  socialPostRequest,
  socialProfilePostsRequest,
  socialProfileRequest,
} from "../src/social-validation.js";
import {
  profileResponse,
  postResponse,
  recordingFetch,
  sampleResponse,
} from "./social-fixtures.js";

const invalidRequest = (error: unknown) =>
  error instanceof SocialClientError && error.code === "invalid_request";

test("exactly one selector and route-specific bounds are validated before fetch", () => {
  for (const params of [
    {},
    { username: "lovelaurieb", url: "https://www.instagram.com/lovelaurieb/" },
    { username: "@lovelaurieb" },
    { username: "." },
    { username: ".." },
    { username: "a".repeat(31) },
    { username: "love laurieb" },
    { username: 42 },
    { username: "lovelaurieb", max_posts: 12 },
    { username: "lovelaurieb", timeout_ms: 4999 },
    { username: "lovelaurieb", timeout_ms: 60001 },
    { username: "lovelaurieb", timeout_ms: 30000.5 },
    { username: "lovelaurieb", timeout_ms: "30000" },
  ])
    assert.throws(
      () => socialProfileRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );

  for (const url of [
    "http://www.instagram.com/lovelaurieb/",
    "ftp://www.instagram.com/lovelaurieb/",
    "https://evil.example/lovelaurieb/",
    "https://user:pass@www.instagram.com/lovelaurieb/",
    "https://www.instagram.com:443/lovelaurieb/",
    "https://www.instagram.com/love%6Caurieb/",
    "https://www.instagram.com/love\\laurieb/",
    "https://www.instagram.com/lovelaurieb/extra/",
    "https://www.instagram.com/lovelaurieb//",
    "https://www.instagram.com/../lovelaurieb/",
    "https://www.instagram.com/p/DfSl0YxhJiA/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/API/",
    `https://www.instagram.com/${"a".repeat(500)}/`,
    "\u0000https://www.instagram.com/lovelaurieb/",
  ])
    assert.throws(() => socialProfileRequest({ url }), invalidRequest, url);

  for (const params of [
    {},
    {
      shortcode: "DfSl0YxhJiA",
      url: "https://www.instagram.com/p/DfSl0YxhJiA/",
    },
    { shortcode: "abc" },
    { shortcode: "@DfSl0YxhJiA" },
    { shortcode: 12345 },
    { shortcode: "DfSl0YxhJiA", timeout_ms: 60001 },
  ])
    assert.throws(
      () => socialPostRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );

  for (const url of [
    "https://www.instagram.com/DfSl0YxhJiA/",
    "https://www.instagram.com/p/abc/",
    "https://www.instagram.com/gallery/DfSl0YxhJiA/",
    "https://www.instagram.com/lovelaurieb/reel/DfSl0YxhJiA/",
    "https://www.instagram.com/p/DfSl0YxhJiA/extra/",
  ])
    assert.throws(() => socialPostRequest({ url }), invalidRequest, url);

  for (const max_posts of [0, 51, 12.5, "12"])
    assert.throws(
      () =>
        socialProfilePostsRequest({
          username: "lovelaurieb",
          max_posts: max_posts as never,
        }),
      invalidRequest,
      String(max_posts),
    );
});

test("canonical URLs, platform and route-specific limits are accepted", () => {
  for (const url of [
    "https://instagram.com/lovelaurieb",
    "https://www.instagram.com/lovelaurieb/?hl=en#top",
    " https://www.instagram.com/lovelaurieb/ ",
  ])
    assert.equal(socialProfileRequest({ url }).body.url, url.trim());

  assert.deepEqual(
    socialProfileRequest({ username: " lovelaurieb ", platform: "instagram" }),
    {
      endpoint: "/v1/social/profile",
      body: {
        platform: "instagram",
        username: "lovelaurieb",
        timeout_ms: 30000,
      },
      serverTimeoutMs: 30000,
    },
  );
  assert.equal(
    socialProfileRequest({ username: "x", timeout_ms: 60000 }).serverTimeoutMs,
    60000,
  );

  for (const url of [
    "https://www.instagram.com/p/DfSl0YxhJiA/",
    "https://instagram.com/reel/DfSl0YxhJiA",
    "https://www.instagram.com/reels/DfSl0YxhJiA/",
    "https://www.instagram.com/lovelaurieb/p/DfSl0YxhJiA/",
  ])
    assert.equal(socialPostRequest({ url }).body.url, url);

  assert.deepEqual(socialPostRequest({ shortcode: "DfSl0YxhJiA" }), {
    endpoint: "/v1/social/post",
    body: {
      platform: "instagram",
      shortcode: "DfSl0YxhJiA",
      timeout_ms: 30000,
    },
    serverTimeoutMs: 30000,
  });
  assert.equal(
    socialPostRequest({ shortcode: "DfSl0YxhJiA", timeout_ms: 5000 })
      .serverTimeoutMs,
    5000,
  );

  assert.deepEqual(
    socialProfilePostsRequest({
      username: "lovelaurieb",
      timeout_ms: 180000,
      max_posts: 50,
    }),
    {
      endpoint: "/v1/social/profile-posts",
      body: {
        platform: "instagram",
        username: "lovelaurieb",
        max_posts: 50,
        timeout_ms: 180000,
      },
      serverTimeoutMs: 180000,
    },
  );
});

test("one call per intent addresses exactly its route with the resolved timeout", async () => {
  const profileCall = recordingFetch(profileResponse);
  await getSocialProfile(
    { username: "lovelaurieb" },
    {
      env: { DISCOVERY_BASE_URL: "https://discovery.example" },
      fetch: profileCall.fetch,
    },
  );
  const sampleCall = recordingFetch(sampleResponse);
  await getSocialProfilePosts(
    { username: "lovelaurieb" },
    {
      env: { DISCOVERY_BASE_URL: "https://discovery.example" },
      fetch: sampleCall.fetch,
    },
  );
  const postCall = recordingFetch(postResponse);
  await getSocialPost(
    { shortcode: "DfSl0YxhJiA" },
    {
      env: { DISCOVERY_BASE_URL: "https://discovery.example" },
      fetch: postCall.fetch,
    },
  );
  assert.equal(profileCall.calls.length, 1);
  assert.equal(sampleCall.calls.length, 1);
  assert.equal(postCall.calls.length, 1);
  assert.equal(
    profileCall.calls[0].url,
    "https://discovery.example/v1/social/profile",
  );
  assert.equal(
    sampleCall.calls[0].url,
    "https://discovery.example/v1/social/profile-posts",
  );
  assert.equal(
    postCall.calls[0].url,
    "https://discovery.example/v1/social/post",
  );
  assert.equal(profileCall.calls[0].body.timeout_ms, 30000);
  assert.equal(sampleCall.calls[0].body.timeout_ms, 120000);
  assert.equal(sampleCall.calls[0].body.max_posts, 12);
  assert.equal(postCall.calls[0].body.timeout_ms, 30000);
  for (const call of [
    profileCall.calls[0],
    sampleCall.calls[0],
    postCall.calls[0],
  ]) {
    assert.equal(new URL(call.url).host, "discovery.example");
    assert.equal(call.body.platform, "instagram");
  }
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
  await getSocialProfile(
    { username: "lovelaurieb", timeout_ms: 60000 },
    {
      env: { DISCOVERY_SOCIAL_TIMEOUT_MS: "100" },
      fetch: recordingFetch(profileResponse).fetch,
    },
  );
  await getSocialProfilePosts(
    { username: "lovelaurieb", timeout_ms: 180000 },
    {
      env: { DISCOVERY_SOCIAL_TIMEOUT_MS: "100" },
      fetch: recordingFetch(sampleResponse).fetch,
    },
  );
  await getSocialProfile(
    { username: "lovelaurieb" },
    { env: {}, fetch: recordingFetch(profileResponse).fetch },
  );
  assert.deepEqual(observed, [70000, 190000, 130000]);
});

test("unresolved or invalid Discovery configuration fails safely", async () => {
  for (const env of [
    { DISCOVERY_BASE_URL: "http://user:pass@10.8.0.1:18080" },
    { DISCOVERY_BASE_URL: "http://10.8.0.1:18080/api" },
    { DISCOVERY_SOCIAL_TIMEOUT_MS: "0" },
    { DISCOVERY_SOCIAL_TIMEOUT_MS: "abc" },
  ])
    await assert.rejects(
      getSocialProfile(
        { username: "lovelaurieb" },
        { env, fetch: recordingFetch(profileResponse).fetch },
      ),
      invalidRequest,
      JSON.stringify(env),
    );
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
    getSocialProfile(
      { username: "lovelaurieb" },
      {
        env: { DISCOVERY_SOCIAL_TIMEOUT_MS: "100" },
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
      error instanceof SocialClientError &&
      error.code === "timeout" &&
      !error.message.includes("raw transport text"),
  );
  assert.equal(observed, 40000);
  assert.equal(calls, 1);
});

test("caller abort wins before the fetch, during it, and the listener is removed", async (t) => {
  let calls = 0;
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    getSocialProfile(
      { username: "lovelaurieb" },
      {
        env: {},
        signal: preAborted.signal,
        fetch: (async () => {
          calls++;
          return new Response(JSON.stringify(profileResponse));
        }) as unknown as typeof fetch,
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);

  const controller = new AbortController();
  const pending = getSocialProfile(
    { username: "lovelaurieb" },
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

  const removed: string[] = [];
  const originalRemove = AbortSignal.prototype.removeEventListener;
  t.mock.method(
    AbortSignal.prototype,
    "removeEventListener",
    function (
      this: AbortSignal,
      type: string,
      listener: never,
      options?: never,
    ) {
      removed.push(type);
      return originalRemove.call(this, type, listener, options);
    },
  );
  const done = new AbortController();
  await getSocialProfile(
    { username: "lovelaurieb" },
    {
      env: {},
      signal: done.signal,
      fetch: recordingFetch(profileResponse).fetch,
    },
  );
  assert.deepEqual(removed, ["abort"]);
});

test("server errors keep sanitized codes, request ids and advisory Retry-After", async () => {
  const cases: Array<[number, string, string, number | undefined]> = [
    [401, "social_disabled", "social_disabled", undefined],
    [404, "social_profile_not_found", "social_profile_not_found", undefined],
    [429, "social_rate_limited", "social_rate_limited", 60000],
    [429, "social_queue_full", "social_queue_full", 1000],
    [502, "social_schema_changed", "social_schema_changed", undefined],
    [504, "social_timeout", "social_timeout", undefined],
  ];
  for (const [status, code, serverCode, retryAfterMs] of cases) {
    const recorded = recordingFetch(
      {
        error: {
          code,
          message: "RAW UPSTREAM TEXT",
          request_id: "safe-id",
          reason: "shape",
        },
      },
      {
        status,
        headers: retryAfterMs
          ? { "Retry-After": String(retryAfterMs / 1000) }
          : undefined,
      },
    );
    await assert.rejects(
      getSocialProfile(
        { username: "lovelaurieb" },
        { env: {}, fetch: recorded.fetch },
      ),
      (error: unknown) =>
        error instanceof SocialClientError &&
        error.status === status &&
        error.serverCode === serverCode &&
        error.requestId === "safe-id" &&
        error.retryAfterMs === retryAfterMs &&
        error.reason === "shape" &&
        !error.message.includes("RAW UPSTREAM"),
      `${status} ${code}`,
    );
    assert.equal(recorded.calls.length, 1);
  }
});

test("unknown server codes, malformed success bodies and transport failures stay safe", async () => {
  await assert.rejects(
    getSocialProfile(
      { username: "lovelaurieb" },
      {
        env: {},
        fetch: recordingFetch(
          { error: { code: "unexpected_code", request_id: "safe" } },
          { status: 500 },
        ).fetch,
      },
    ),
    (error: unknown) =>
      error instanceof SocialClientError &&
      error.code === "upstream" &&
      error.serverCode === undefined &&
      error.status === 500,
  );

  const malformedBodies: unknown[] = [
    {},
    { ...profileResponse, platform: "youtube" },
    { ...profileResponse, observed_at: "2026-11-05 11:00:00" },
    {
      ...profileResponse,
      profile: { ...profileResponse.profile, is_private: undefined },
    },
    {
      ...profileResponse,
      profile: { ...profileResponse.profile, follower_count: -1 },
    },
    { ...profileResponse, timings: { queue_ms: 0, upstream_ms: 1 } },
    {
      ...profileResponse,
      profile: { ...profileResponse.profile, bio_links: { url: "x" } },
    },
  ];
  for (const body of malformedBodies)
    await assert.rejects(
      getSocialProfile(
        { username: "lovelaurieb" },
        { env: {}, fetch: recordingFetch(body).fetch },
      ),
      (error: unknown) =>
        error instanceof SocialClientError && error.code === "malformed",
    );

  await assert.rejects(
    getSocialProfile(
      { username: "lovelaurieb" },
      {
        env: {},
        fetch: recordingFetch(undefined, { text: "<html>not json</html>" })
          .fetch,
      },
    ),
    (error: unknown) =>
      error instanceof SocialClientError && error.code === "malformed",
  );

  await assert.rejects(
    getSocialProfile(
      { username: "lovelaurieb" },
      {
        env: {},
        fetch: (async () => {
          throw new Error("socket hang up: 10.8.0.1");
        }) as unknown as typeof fetch,
      },
    ),
    (error: unknown) =>
      error instanceof SocialClientError &&
      error.code === "transport" &&
      !error.message.includes("socket hang up"),
  );
});

test("partial samples keep body retry_after_s and ignore a spurious 200 Retry-After", async () => {
  const recorded = recordingFetch(sampleResponse, {
    headers: { "Retry-After": "60" },
  });
  const sample = await getSocialProfilePosts(
    { username: "lovelaurieb" },
    { env: {}, fetch: recorded.fetch },
  );
  assert.equal(sample.partial, true);
  assert.equal(sample.sample_failure?.retry_after_s, 0);
  assert.equal(sample.failed_posts.length, 1);
  assert.equal(sample.failed_posts[0].error_code, "social_post_not_found");
  assert.equal(recorded.calls.length, 1);

  const success = await getSocialProfilePosts(
    { username: "lovelaurieb" },
    {
      env: {},
      fetch: recordingFetch({
        ...sampleResponse,
        partial: false,
        failed_posts: [],
        sample_failure: null,
        truncation: [],
      }).fetch,
    },
  );
  assert.equal(success.partial, false);
  assert.equal(success.sample_failure, null);
});

test("response validation enforces the documented sample invariants", async () => {
  const broken: unknown[] = [
    { ...sampleResponse, returned_posts: 2 },
    { ...sampleResponse, returned_posts: 13 },
    { ...sampleResponse, requested_posts: 0 },
    { ...sampleResponse, partial: false },
    { ...sampleResponse, has_more_posts: "true" },
    { ...sampleResponse, truncation: ["page_failure", "page_failure"] },
    { ...sampleResponse, truncation: [{ stage: "x" }] },
    {
      ...sampleResponse,
      failed_posts: [
        { shortcode: "Deleted01", error_code: "not_found", reason: null },
      ],
    },
    {
      ...sampleResponse,
      sample_failure: {
        stage: "listing",
        error_code: "social_post_not_found",
        reason: null,
        retry_after_s: null,
      },
    },
    {
      ...sampleResponse,
      posts: [{ ...sampleResponse.posts[0], author: { username: "x" } }],
    },
    {
      ...sampleResponse,
      posts: [{ ...sampleResponse.posts[0], published_at: 1700000000 }],
    },
    {
      ...sampleResponse,
      posts: [
        {
          ...sampleResponse.posts[0],
          carousel: [
            {
              id: "c1",
              content_type: "carousel",
              thumbnail: null,
              video: null,
            },
          ],
        },
      ],
    },
    {
      ...sampleResponse,
      posts: [{ ...sampleResponse.posts[0], like_count: "0" }],
    },
  ];
  for (const body of broken)
    await assert.rejects(
      getSocialProfilePosts(
        { username: "lovelaurieb" },
        { env: {}, fetch: recordingFetch(body).fetch },
      ),
      (error: unknown) =>
        error instanceof SocialClientError && error.code === "malformed",
      JSON.stringify(body).slice(0, 120),
    );
});
