import assert from "node:assert/strict";
import test from "node:test";
import {
  askWeb,
  WebAnswerClientError,
  formatWebAnswer,
} from "../src/answer.js";
import { resolveDiscoveryConfig } from "../src/config.js";

const payload = () => ({
  id: "request-1",
  query: "Python",
  answer: "See https://invented.example/",
  provider: "codex_cli",
  model: "gpt-6-luna",
  source_type: "search_results",
  sources: [
    { url: " https://python.org/ ", title: " Python " },
    { url: "https://python.org/" },
    { url: "file:///secret" },
  ],
  searches: [{ action: "search", queries: ["Python"] }],
  gaps: [],
  timings: { queue_ms: 0, agent_ms: 10, total_ms: 10 },
});
const fake =
  (data: unknown, status = 200, headers?: HeadersInit): typeof fetch =>
  async () =>
    new Response(JSON.stringify(data), { status, headers });

test("A: request and production-shaped response; strict validation before quota", async () => {
  let calls = 0;
  const result = await askWeb(
    { query: " Python ", instructions: " briefly ", max_sources: 2 },
    {
      env: {},
      fetch: async (url, init) => {
        calls++;
        assert.equal(String(url), "http://10.8.0.1:18080/v1/web-answer");
        assert.equal(init?.method, "POST");
        assert.equal(init?.redirect, "error");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          query: "Python",
          instructions: "briefly",
          max_sources: 2,
          timeout_ms: 60000,
        });
        assert.equal(new Headers(init?.headers).has("authorization"), false);
        assert.ok(init?.signal);
        return fake(payload())(url, init);
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.source_type, "search_results");
  assert.deepEqual(result.searches[0].queries, ["Python"]);
  assert.equal(result.usage, undefined);
  for (const params of [
    { query: "" },
    { query: "x", max_sources: 1.2 },
    { query: "x", max_sources: 21 },
    { query: "x", timeout_ms: 4999 },
    { query: "x", instructions: "x".repeat(4001) },
    { query: "x", context_size: "high" },
  ])
    await assert.rejects(
      askWeb(params, {
        fetch: async () => {
          throw Error("must not fetch");
        },
      }),
      { code: "invalid_request" },
    );
  for (const bad of [
    { ...payload(), answer: 4 },
    { ...payload(), timings: null },
    { ...payload(), searches: [{ action: "search", queries: "x" }] },
    { ...payload(), usage: { web_search_calls: -1 } },
    {},
  ])
    await assert.rejects(askWeb({ query: "x" }, { fetch: fake(bad) }), {
      code: "malformed",
    });
  await assert.rejects(
    askWeb({ query: "x" }, { fetch: async () => new Response("no JSON") }),
    { code: "malformed" },
  );
  const empty = await askWeb(
    { query: "x" },
    {
      fetch: fake({
        ...payload(),
        sources: [],
        gaps: ["no_sources", "future_gap"],
      }),
    },
  );
  assert.deepEqual(empty.gaps, ["no_sources", "future_gap"]);
});

test("B: errors distinguish disabled/auth/busy/quota and never guess", async () => {
  for (const [status, serverCode, code] of [
    [400, "invalid_request", "invalid_request"],
    [401, "web_answer_disabled", "disabled"],
    [401, "codex_auth_expired", "auth"],
    [429, "web_answer_queue_full", "busy"],
    [429, "codex_rate_limited", "quota"],
    [502, "codex_transport", "upstream"],
    [504, "codex_timeout", "timeout"],
    [401, "unknown", "upstream"],
    [503, "codex_rate_limited", "upstream"],
  ] as const) {
    await assert.rejects(
      askWeb(
        { query: "x" },
        {
          fetch: fake(
            {
              error: {
                code: serverCode,
                message: "SECRET-BODY",
                request_id: "r",
              },
            },
            status,
            { "Retry-After": "30" },
          ),
        },
      ),
      (e: unknown) => {
        assert.ok(e instanceof WebAnswerClientError);
        assert.equal(e.code, code);
        assert.equal(e.status, status);
        assert.equal(e.retryAfterMs, 30000);
        assert.equal(e.requestId, "r");
        assert.doesNotMatch(e.message, /SECRET-BODY/);
        return true;
      },
    );
  }
  for (const [value, wanted] of [
    ["bad", undefined],
    ["-1", undefined],
    ["Thu, 01 Jan 1970 00:00:00 GMT", 0],
  ] as const)
    await assert.rejects(
      askWeb(
        { query: "x" },
        { fetch: fake({}, 429, { "Retry-After": value }) },
      ),
      (e: unknown) =>
        e instanceof WebAnswerClientError && e.retryAfterMs === wanted,
    );
  const future = new Date(Date.now() + 60000).toUTCString();
  await assert.rejects(
    askWeb({ query: "x" }, { fetch: fake({}, 429, { "Retry-After": future }) }),
    (e: unknown) =>
      e instanceof WebAnswerClientError &&
      !!e.retryAfterMs &&
      e.retryAfterMs <= 60000,
  );
});

test("C: cancellation and local deadline cover fetch and body read", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    askWeb(
      { query: "x" },
      {
        signal: controller.signal,
        fetch: async () => {
          calls++;
          return new Response();
        },
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
  await assert.rejects(
    askWeb(
      { query: "x", timeout_ms: 60000 },
      { timeoutMs: 60001, fetch: fake(payload()) },
    ),
    { code: "invalid_request" },
  );
  for (const body of [false, true]) {
    const parent = new AbortController();
    let observed: AbortSignal | undefined;
    const blocked: typeof fetch = async (_url, init) => {
      observed = init?.signal as AbortSignal;
      const wait = () =>
        new Promise<never>((_, reject) =>
          observed!.addEventListener("abort", () => reject(observed!.reason), {
            once: true,
          }),
        );
      if (!body) return wait();
      return { ok: true, status: 200, json: wait } as unknown as Response;
    };
    const request = askWeb(
      { query: "x" },
      { signal: parent.signal, fetch: blocked },
    );
    setTimeout(() => parent.abort(), 5);
    await assert.rejects(request, { name: "AbortError" });
    assert.equal(observed?.aborted, true);
  }
  // Use the real minimum valid HTTP deadline. No production-only timer injection.
  await assert.rejects(
    askWeb(
      { query: "x", timeout_ms: 5000 },
      {
        timeoutMs: 10000,
        fetch: async (_u, i) =>
          new Promise((_, reject) =>
            i!.signal!.addEventListener(
              "abort",
              () => reject(i!.signal!.reason),
              { once: true },
            ),
          ),
      },
    ),
    { code: "timeout" },
  );
});

test("D: origin policy and safe diagnostics", async () => {
  for (const url of ["http://10.8.0.1:18080/", "https://discovery.example"])
    assert.ok(resolveDiscoveryConfig({ DISCOVERY_BASE_URL: url }).baseUrl);
  for (const url of [
    "https://user:SECRET@discovery.example",
    "file:///tmp/a",
    "https://example.org/path",
    "https://example.org/?secret=1",
    "https://example.org/#secret",
    "invalid",
  ]) {
    assert.throws(
      () => resolveDiscoveryConfig({ DISCOVERY_BASE_URL: url }),
      (e: unknown) =>
        e instanceof WebAnswerClientError &&
        !e.message.includes(url) &&
        !e.message.includes("SECRET"),
    );
  }
  await assert.rejects(
    askWeb(
      { query: "SECRET-QUERY" },
      {
        fetch: async () => {
          throw Error("SECRET-QUERY upstream stack");
        },
      },
    ),
    (e: unknown) =>
      e instanceof WebAnswerClientError &&
      e.code === "transport" &&
      !JSON.stringify(e).includes("SECRET-QUERY"),
  );
});

test("E: source evidence and rendering never mine answer prose", async () => {
  const data = payload();
  data.sources.push(
    ...Array.from({ length: 25 }, (_, i) => ({
      url: `https://example.org/${i}`,
    })),
  );
  const result = await askWeb(
    { query: "x", max_sources: 2 },
    { fetch: fake(data) },
  );
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources[0], {
    url: "https://python.org/",
    title: "Python",
  });
  const rendered = formatWebAnswer(result, 23);
  assert.deepEqual(rendered.details.sources, result.sources);
  assert.equal(rendered.details.latencyMs, 23);
  assert.equal(rendered.details.answerChars, result.answer.length);
  assert.ok(rendered.text.startsWith(result.answer));
  assert.match(rendered.text, /Web activity: 1 recorded action · 0.0 s server/);
  const clipped = formatWebAnswer(
    {
      ...result,
      answer: "Inline [source](https://outside-cap.example/)",
      gaps: ["results_truncated"],
    },
    23,
  );
  assert.ok(
    clipped.text.startsWith("Inline [source](https://outside-cap.example/)"),
  );
  assert.match(clipped.text, /results_truncated/);
  assert.equal(clipped.details.usage, undefined);
  assert.doesNotMatch(
    rendered.text.split("Retrieved results—may include uncited pages:")[1],
    /invented/,
  );
  assert.equal(
    (await askWeb({ query: "x" }, { fetch: fake(data) })).sources.length,
    5,
  );
  assert.equal(
    (await askWeb({ query: "x", max_sources: 20 }, { fetch: fake(data) }))
      .sources.length,
    20,
  );
  const empty = formatWebAnswer(
    { ...result, sources: [], gaps: ["no_sources"] },
    0,
  );
  assert.match(empty.text, /no_sources/);
  assert.match(empty.text, /No search results/);
});
