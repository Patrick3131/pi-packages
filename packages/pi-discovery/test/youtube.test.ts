import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getYoutubeChannel,
  getYoutubeTranscript,
  getYoutubeVideo,
  searchYoutube,
  YoutubeClientError,
} from "../src/youtube.js";
import {
  parseYoutubeSearchResponse,
  parseYoutubeChannelResponse,
  parseYoutubeTranscriptResponse,
  youtubeChannelRequest,
  youtubeSearchRequest,
  youtubeTranscriptRequest,
  youtubeVideoRequest,
  parseYoutubeVideoResponse,
} from "../src/youtube-validation.js";
import {
  formatYoutubeSearch,
  formatYoutubeTranscript,
} from "../src/youtube-format.js";
import {
  channelResponse,
  segmentResponse,
  searchResponse,
  textResponse,
  videoResponse,
  recordingFetch,
} from "./youtube-fixtures.js";

const invalidRequest = (error: unknown) =>
  error instanceof YoutubeClientError && error.code === "invalid_request";
const malformed = (error: unknown) =>
  error instanceof YoutubeClientError && error.code === "malformed";

test("search request bounds are strict and defaults are explicit", () => {
  for (const params of [
    {},
    { query: "" },
    { query: "   " },
    { query: "x".repeat(201) },
    { query: 42 },
    { query: "x", max_results: 0 },
    { query: "x", max_results: 21 },
    { query: "x", max_results: 2.5 },
    { query: "x", max_results: "5" },
    { query: "x", language: "EN" },
    { query: "x", language: "english" },
    { query: "x", language: 5 },
    { query: "x", region: "USA" },
    { query: "x", region: "1A" },
    { query: "x", region: 42 },
    { query: "x", timeout_ms: 4999 },
    { query: "x", timeout_ms: 30001 },
    { query: "x", timeout_ms: 30000.5 },
    { query: "x", timeout_ms: "30000" },
    { query: "x", page: 2 },
  ])
    assert.throws(
      () => youtubeSearchRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );

  assert.deepEqual(youtubeSearchRequest({ query: "  python 3.13  " }), {
    endpoint: "/v1/youtube/search",
    body: {
      query: "python 3.13",
      max_results: 20,
      language: "en",
      region: "US",
      timeout_ms: 30000,
    },
    serverTimeoutMs: 30000,
  });
  assert.deepEqual(
    youtubeSearchRequest({
      query: "x",
      max_results: 5,
      language: "de",
      region: "de",
      timeout_ms: 5000,
    }).body,
    {
      query: "x",
      max_results: 5,
      language: "de",
      region: "DE",
      timeout_ms: 5000,
    },
  );
});

test("transcript selectors accept one exact id or a canonical YouTube URL", () => {
  for (const params of [
    {},
    { video_id: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ" },
    { video_id: "short" },
    { video_id: "dQw4w9WgXc" },
    { video_id: "dQw4w9WgXcQ!" },
    { video_id: 42 },
    { video_id: "dQw4w9WgXcQ", format: "xml" },
    { video_id: "dQw4w9WgXcQ", language: "EN" },
    { video_id: "dQw4w9WgXcQ", language: "english" },
    { video_id: "dQw4w9WgXcQ", max_chars: 999 },
    { video_id: "dQw4w9WgXcQ", max_chars: 300001 },
    { video_id: "dQw4w9WgXcQ", max_chars: 1000.5 },
    { video_id: "dQw4w9WgXcQ", timeout_ms: 4999 },
    { video_id: "dQw4w9WgXcQ", timeout_ms: 30001 },
    { video_id: "dQw4w9WgXcQ", extra: true },
  ])
    assert.throws(
      () => youtubeTranscriptRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );

  for (const url of [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=1",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ/",
    "https://youtu.be/dQw4w9WgXcQ?t=1",
    " https://youtu.be/dQw4w9WgXcQ ",
  ]) {
    const request = youtubeTranscriptRequest({ url });
    assert.equal(request.resolvedVideoId, "dQw4w9WgXcQ", url);
    assert.equal(request.body.url, url.trim());
  }

  for (const url of [
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/",
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "https://youtu.be//dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ/extra",
    "https://www.youtube.com/shorts/short",
    "https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ",
    "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/channel/UC123",
    `https://youtu.be/${"a".repeat(3000)}`,
  ])
    assert.throws(() => youtubeTranscriptRequest({ url }), invalidRequest, url);

  assert.deepEqual(youtubeTranscriptRequest({ video_id: "dQw4w9WgXcQ" }), {
    endpoint: "/v1/youtube/transcript",
    body: {
      video_id: "dQw4w9WgXcQ",
      format: "segments",
      max_chars: 200000,
      timeout_ms: 30000,
    },
    serverTimeoutMs: 30000,
    resolvedVideoId: "dQw4w9WgXcQ",
    format: "segments",
  });
  assert.deepEqual(
    youtubeTranscriptRequest({
      video_id: "dQw4w9WgXcQ",
      language: "de",
      format: "text",
      max_chars: 5000,
      timeout_ms: 5000,
    }).body,
    {
      video_id: "dQw4w9WgXcQ",
      language: "de",
      format: "text",
      max_chars: 5000,
      timeout_ms: 5000,
    },
  );
});

test("one call per intent posts exactly to its route with no retry", async () => {
  const searchCall = recordingFetch(searchResponse);
  const search = await searchYoutube(
    { query: "python 3.13", max_results: 2 },
    {
      env: { DISCOVERY_BASE_URL: "https://discovery.example" },
      fetch: searchCall.fetch,
    },
  );
  assert.equal(search.results.length, 2);
  assert.deepEqual(searchCall.calls, [
    {
      url: "https://discovery.example/v1/youtube/search",
      body: {
        query: "python 3.13",
        max_results: 2,
        language: "en",
        region: "US",
        timeout_ms: 30000,
      },
    },
  ]);

  const transcriptCall = recordingFetch(segmentResponse);
  const transcript = await getYoutubeTranscript(
    { url: "https://youtu.be/dQw4w9WgXcQ" },
    {
      env: { DISCOVERY_BASE_URL: "https://discovery.example" },
      fetch: transcriptCall.fetch,
    },
  );
  assert.equal(transcript.segments.length, 2);
  assert.deepEqual(transcriptCall.calls, [
    {
      url: "https://discovery.example/v1/youtube/transcript",
      body: {
        url: "https://youtu.be/dQw4w9WgXcQ",
        format: "segments",
        max_chars: 200000,
        timeout_ms: 30000,
      },
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
  await searchYoutube(
    { query: "x", timeout_ms: 30000 },
    {
      env: { DISCOVERY_YOUTUBE_TIMEOUT_MS: "100" },
      fetch: recordingFetch(searchResponse).fetch,
    },
  );
  await getYoutubeTranscript(
    { video_id: "dQw4w9WgXcQ", timeout_ms: 5000 },
    {
      env: { DISCOVERY_YOUTUBE_TIMEOUT_MS: "100" },
      fetch: recordingFetch(segmentResponse).fetch,
    },
  );
  await searchYoutube(
    { query: "x" },
    {
      env: { DISCOVERY_YOUTUBE_TIMEOUT_MS: "200000" },
      fetch: recordingFetch(searchResponse).fetch,
    },
  );
  assert.deepEqual(observed, [40000, 15000, 200000]);
});

test("unresolved or invalid Discovery configuration fails safely", async () => {
  for (const env of [
    { DISCOVERY_BASE_URL: "http://user:pass@10.8.0.1:18080" },
    { DISCOVERY_BASE_URL: "http://10.8.0.1:18080/api" },
    { DISCOVERY_YOUTUBE_TIMEOUT_MS: "0" },
    { DISCOVERY_YOUTUBE_TIMEOUT_MS: "abc" },
  ])
    await assert.rejects(
      searchYoutube(
        { query: "x" },
        { env, fetch: recordingFetch(searchResponse).fetch },
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
    searchYoutube(
      { query: "x" },
      {
        env: { DISCOVERY_YOUTUBE_TIMEOUT_MS: "100" },
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
      error instanceof YoutubeClientError &&
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
    searchYoutube(
      { query: "x" },
      {
        env: {},
        signal: preAborted.signal,
        fetch: (async () => {
          calls++;
          return new Response(JSON.stringify(searchResponse));
        }) as unknown as typeof fetch,
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);

  const controller = new AbortController();
  const pending = getYoutubeTranscript(
    { video_id: "dQw4w9WgXcQ" },
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

test("server errors keep sanitized codes, request ids and advisory Retry-After", async () => {
  const cases: Array<[number, string, string, number | undefined]> = [
    [400, "youtube_invalid_request", "invalid_request", undefined],
    [401, "youtube_disabled", "disabled", undefined],
    [404, "youtube_no_captions", "not_found", undefined],
    [404, "youtube_unavailable", "not_found", undefined],
    [404, "youtube_channel_not_found", "not_found", undefined],
    [429, "youtube_queue_full", "queue_full", 1000],
    [502, "youtube_blocked", "blocked", undefined],
    [502, "youtube_upstream", "upstream", undefined],
    [504, "youtube_timeout", "timeout", undefined],
  ];
  for (const [status, code, clientCode, retryAfterMs] of cases) {
    const recorded = recordingFetch(
      {
        error: {
          code,
          message: "RAW UPSTREAM TEXT",
          request_id: "safe-id",
          reason: code === "youtube_blocked" ? "proxy_auth" : undefined,
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
      searchYoutube({ query: "x" }, { env: {}, fetch: recorded.fetch }),
      (error: unknown) =>
        error instanceof YoutubeClientError &&
        error.code === clientCode &&
        error.status === status &&
        error.serverCode === code &&
        error.requestId === "safe-id" &&
        error.retryAfterMs === retryAfterMs &&
        (code !== "youtube_blocked" || error.reason === "proxy_auth") &&
        !error.message.includes("RAW UPSTREAM"),
      `${status} ${code}`,
    );
    assert.equal(recorded.calls.length, 1);
  }
});

test("unknown server codes, malformed bodies and transport failures stay safe", async () => {
  await assert.rejects(
    searchYoutube(
      { query: "x" },
      {
        env: {},
        fetch: recordingFetch(
          { error: { code: "unexpected_code", request_id: "safe" } },
          { status: 500 },
        ).fetch,
      },
    ),
    (error: unknown) =>
      error instanceof YoutubeClientError &&
      error.code === "upstream" &&
      error.serverCode === undefined &&
      error.status === 500,
  );

  for (const body of [
    {},
    { ...searchResponse, query: "" },
    {
      ...searchResponse,
      results: [searchResponse.results[0], searchResponse.results[0]],
    },
    {
      ...searchResponse,
      results: [{ ...searchResponse.results[0], url: "https://evil.example" }],
    },
    {
      ...searchResponse,
      results: [{ ...searchResponse.results[0], video_id: "short" }],
    },
    { ...searchResponse, estimated_results: -1 },
    { ...searchResponse, results: "nope" },
  ])
    await assert.rejects(
      searchYoutube(
        { query: "x", max_results: 2 },
        { env: {}, fetch: recordingFetch(body).fetch },
      ),
      malformed,
      JSON.stringify(body),
    );

  await assert.rejects(
    searchYoutube(
      { query: "x", max_results: 1 },
      {
        env: {},
        fetch: recordingFetch({
          ...searchResponse,
          results: [searchResponse.results[0], searchResponse.results[1]],
        }).fetch,
      },
    ),
    malformed,
  );

  for (const body of [
    {},
    { ...segmentResponse, video_id: "mMHw1zEev-0" },
    { ...segmentResponse, text: "both" },
    { ...segmentResponse, language: "EN" },
    { ...segmentResponse, available_languages: ["en", "en"] },
    {
      ...segmentResponse,
      segments: [{ start_ms: -1, duration_ms: 0, text: "x" }],
    },
    { ...textResponse, segments: segmentResponse.segments },
  ])
    await assert.rejects(
      getYoutubeTranscript(
        {
          video_id: "dQw4w9WgXcQ",
          format: body === textResponse ? "text" : "segments",
        },
        { env: {}, fetch: recordingFetch(body).fetch },
      ),
      malformed,
      JSON.stringify(body),
    );

  await assert.rejects(
    searchYoutube(
      { query: "x" },
      {
        env: {},
        fetch: (async () => {
          throw new Error("socket details");
        }) as unknown as typeof fetch,
      },
    ),
    (error: unknown) =>
      error instanceof YoutubeClientError &&
      error.code === "transport" &&
      !error.message.includes("socket details"),
  );
});

test("empty transcript windows and channel pages parse without inventing content", () => {
  const empty = {
    ...segmentResponse,
    segments: [],
    text: null,
    total_chars: 40,
    returned_chars: 0,
    window_start_ms: 5000,
    next_start_ms: null,
    truncated: false,
  };
  assert.deepEqual(
    parseYoutubeTranscriptResponse(empty, {
      resolvedVideoId: "dQw4w9WgXcQ",
      format: "segments",
    }),
    empty,
  );
  assert.match(
    formatYoutubeTranscript(empty).text,
    /empty; this is a valid complete position/,
  );
  assert.deepEqual(
    parseYoutubeChannelResponse(channelResponse),
    channelResponse,
  );
});

test("channel requests validate selectors and mirror url bounds", () => {
  assert.deepEqual(
    youtubeChannelRequest({ channel_id: "UCaobKrMmIx40ZE_MGxbqDPA" }),
    {
      endpoint: "/v1/youtube/channel",
      body: {
        channel_id: "UCaobKrMmIx40ZE_MGxbqDPA",
        language: "en",
        region: "US",
        timeout_ms: 30000,
      },
      serverTimeoutMs: 30000,
    },
  );
  assert.deepEqual(
    youtubeChannelRequest({
      channel_id: "UCaobKrMmIx40ZE_MGxbqDPA",
      cursor: "opaque-token",
      timeout_ms: 5000,
    }).body,
    {
      channel_id: "UCaobKrMmIx40ZE_MGxbqDPA",
      cursor: "opaque-token",
      language: "en",
      region: "US",
      timeout_ms: 5000,
    },
  );
  for (const params of [
    {},
    { channel_id: "short" },
    { handle: "TheConsumerBehaviorLab" },
    { handle: "@ab" },
    {
      channel_id: "UCaobKrMmIx40ZE_MGxbqDPA",
      handle: "@TheConsumerBehaviorLab",
    },
    { cursor: "token" },
    { cursor: "bad token", channel_id: "UCaobKrMmIx40ZE_MGxbqDPA" },
    { url: "https://evil.example/@TheConsumerBehaviorLab" },
    { url: "https://www.youtube.com/@TheConsumerBehaviorLab/about" },
    { url: "https://www.youtube.com/c/../x" },
    { channel_id: "UCaobKrMmIx40ZE_MGxbqDPA", max_videos: 10 },
  ])
    assert.throws(
      () => youtubeChannelRequest(params as never),
      invalidRequest,
      JSON.stringify(params),
    );
});

test("search parser reads the legacy caption alias when the new field is absent", () => {
  const aliasOnly = {
    ...searchResponse,
    results: [
      {
        ...searchResponse.results[0],
        captions_advertised: undefined,
        has_captions: true,
      },
    ],
  };
  assert.equal(
    parseYoutubeSearchResponse(aliasOnly).results[0].captions_advertised,
    true,
  );
  assert.equal(
    parseYoutubeSearchResponse(aliasOnly).results[0].has_captions,
    true,
  );
});

test("parsers accept the documented shapes and reject format mismatches", () => {
  assert.deepEqual(
    parseYoutubeSearchResponse(searchResponse, 2),
    searchResponse,
  );
  assert.deepEqual(
    parseYoutubeTranscriptResponse(segmentResponse, {
      resolvedVideoId: "dQw4w9WgXcQ",
      format: "segments",
    }),
    segmentResponse,
  );
  assert.deepEqual(
    parseYoutubeTranscriptResponse(textResponse, {
      resolvedVideoId: "dQw4w9WgXcQ",
      format: "text",
    }),
    textResponse,
  );
  assert.throws(
    () =>
      parseYoutubeTranscriptResponse(textResponse, {
        resolvedVideoId: "dQw4w9WgXcQ",
        format: "segments",
      }),
    malformed,
  );
});

test("model-visible search and transcript output is bounded and explicit", () => {
  const search = formatYoutubeSearch(searchResponse);
  assert.match(search.text, /YouTube search "python 3.13"/);
  assert.match(search.text, /Python 3.13 release/);
  assert.match(search.text, /one provider page/i);
  assert.match(search.text, /no continuation/i);
  assert.ok(search.text.length <= 12000);

  const transcript = formatYoutubeTranscript(segmentResponse);
  assert.match(transcript.text, /YouTube transcript dQw4w9WgXcQ/);
  assert.match(transcript.text, /\[0:00\] Hello and welcome\./);
  assert.match(transcript.text, /Available languages: de-DE, en/);
  assert.ok(transcript.text.length <= 12000);

  const text = formatYoutubeTranscript(textResponse);
  assert.match(text.text, /Text \(.* in this response\)/);
  assert.match(text.text, /Served from this worker's transcript cache/);
  assert.match(text.text, /40 chars from 0:00; total 40; complete/);
  assert.ok(text.text.length <= 12000);

  const overshoot = {
    ...textResponse,
    text: "x".repeat(8000) + "y".repeat(900),
    returned_chars: 8900,
    total_chars: 30000,
    next_start_ms: 900000,
  };
  const overshootText = formatYoutubeTranscript(overshoot).text;
  assert.ok(overshootText.includes("x".repeat(8000) + "y".repeat(900)));
  assert.doesNotMatch(overshootText, /8000 chars from|showing first 8000/i);

  const huge = {
    ...segmentResponse,
    segments: Array.from({ length: 500 }, (_, index) => ({
      start_ms: index * 1000,
      duration_ms: 900,
      text: "segment text ".repeat(20),
    })),
  };
  const bounded = formatYoutubeTranscript(huge);
  assert.ok(bounded.text.length <= 12000);
  assert.match(bounded.text, /Text previews shortened/);
  assert.deepEqual(bounded.details.response, huge);
});

test("video request resolves one selector and never sends a batch", () => {
  const byId = youtubeVideoRequest({ video_id: "p48f-kj1U28" });
  assert.equal(byId.endpoint, "/v1/youtube/video");
  assert.deepEqual(byId.body, { video_id: "p48f-kj1U28", timeout_ms: 30000 });
  assert.equal(byId.resolvedVideoId, "p48f-kj1U28");
  const byUrl = youtubeVideoRequest({ url: "https://youtu.be/p48f-kj1U28" });
  assert.deepEqual(byUrl.body, {
    url: "https://youtu.be/p48f-kj1U28",
    timeout_ms: 30000,
  });
  assert.equal(byUrl.resolvedVideoId, "p48f-kj1U28");
  for (const params of [
    {},
    { video_id: "p48f-kj1U28", url: "https://youtu.be/p48f-kj1U28" },
    { video_id: "short" },
    { url: "https://evil.example/watch?v=p48f-kj1U28" },
    { video_id: "p48f-kj1U28", timeout_ms: 4999 },
    { video_id: "p48f-kj1U28", timeout_ms: 30001 },
    { video_ids: ["p48f-kj1U28"] },
    { video_id: "p48f-kj1U28", language: "de" },
  ])
    assert.throws(() => youtubeVideoRequest(params as never), invalidRequest);
});

test("video response parsing enforces the wire contract", () => {
  assert.equal(
    parseYoutubeVideoResponse(videoResponse, "p48f-kj1U28").published_at,
    "2026-10-28T16:51:31Z",
  );
  const broken = [
    { ...videoResponse, published_at: "2026-10-28" },
    { ...videoResponse, live_status: "none", live: true },
    { ...videoResponse, live_status: "weird" },
    { ...videoResponse, description: "d".repeat(5001) },
    { ...videoResponse, tags: Array.from({ length: 51 }, () => "t") },
    { ...videoResponse, tags: ["x".repeat(101)] },
    { ...videoResponse, source: "innertube" },
    { ...videoResponse, thumbnail_url: "https://evil.example/x.jpg" },
    { ...videoResponse, url: "https://www.youtube.com/watch?v=AAAAAAAAAAA" },
  ];
  for (const value of broken)
    assert.throws(() => parseYoutubeVideoResponse(value), malformed);
  assert.throws(
    () => parseYoutubeVideoResponse(videoResponse, "AAAAAAAAAAA"),
    malformed,
  );
});

test("getYoutubeVideo sends one request and no client retry", async (t) => {
  const { calls, fetch } = recordingFetch(videoResponse);
  t.mock.method(globalThis, "fetch", fetch);
  const result = await getYoutubeVideo({ video_id: "p48f-kj1U28" });
  assert.equal(result.published_at, "2026-10-28T16:51:31Z");
  assert.deepEqual(calls[0]?.body, {
    video_id: "p48f-kj1U28",
    timeout_ms: 30000,
  });
  assert.equal(calls.length, 1);
});

test("channel parsing accepts a nullable published_at and rejects garbage", () => {
  const parsed = parseYoutubeChannelResponse(channelResponse);
  assert.equal(parsed.videos[0]?.published_at, "2026-11-04T17:04:42Z");
  assert.equal(parsed.videos[1]?.published_at, undefined);
  for (const published_at of ["yesterday", 42, "2026-11-04"])
    assert.throws(
      () =>
        parseYoutubeChannelResponse({
          ...channelResponse,
          videos: [{ ...channelResponse.videos[0], published_at }],
        }),
      malformed,
    );
  const legacy = parseYoutubeChannelResponse({
    ...channelResponse,
    videos: channelResponse.videos.map(
      ({ published_at: _omit, ...rest }) => rest,
    ),
  });
  assert.equal(legacy.videos[0]?.published_at, undefined);
});
