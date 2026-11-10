import assert from "node:assert/strict";
import { test } from "node:test";
import { Check } from "typebox/value";
import discovery from "../src/index.js";
import {
  youtubeSearchDefinition,
  youtubeTranscriptDefinition,
} from "../src/youtube-tools.js";
import { recordingFetch, searchResponse, segmentResponse, textResponse } from "./youtube-fixtures.js";

type Registered = {
  name: string;
  defaultActive?: boolean;
  outputSchema?: unknown;
  parameters: unknown;
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<{
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
    details: unknown;
    structuredContent?: unknown;
  }>;
  renderResult: (
    result: {
      isError?: boolean;
      content: Array<{ type: string; text?: string }>;
    },
    options: { expanded: boolean },
  ) => { render: (width: number) => string[] };
};

const savedKeys = [
  "DISCOVERY_WEB_SEARCH_ENABLED",
  "DISCOVERY_WEB_ANSWER_ENABLED",
  "DISCOVERY_AD_LIBRARY_ENABLED",
  "DISCOVERY_SOCIAL_ENABLED",
  "DISCOVERY_YOUTUBE_ENABLED",
] as const;

function register(env: NodeJS.ProcessEnv = {}): Registered[] {
  const saved = Object.fromEntries(savedKeys.map((key) => [key, process.env[key]]));
  for (const key of savedKeys) delete process.env[key];
  if (env.DISCOVERY_YOUTUBE_ENABLED !== undefined)
    process.env.DISCOVERY_YOUTUBE_ENABLED = env.DISCOVERY_YOUTUBE_ENABLED;
  const registered: Registered[] = [];
  try {
    discovery({
      registerTool: (tool: Registered) => registered.push(tool),
    } as unknown as import("@earendil-works/pi-coding-agent").ExtensionAPI);
  } finally {
    for (const key of savedKeys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return registered;
}

const youtube = (tools: Registered[], name: string): Registered =>
  tools.find((tool) => tool.name === name)!;

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

test("registers two YouTube tools enabled by default with an explicit opt-out", () => {
  const registered = register();
  assert.deepEqual(
    registered.map((tool) => tool.name),
    [
      "ad_library_keyword_ads",
      "ad_library_domain_ads",
      "social_profile",
      "social_profile_posts",
      "social_post",
      "youtube_search",
      "youtube_transcript",
      "web_search_searxng",
      "web_answer",
    ],
  );
  for (const name of ["youtube_search", "youtube_transcript"])
    assert.equal(youtube(registered, name).defaultActive, true, name);
  for (const name of [
    "ad_library_keyword_ads",
    "social_profile",
    "web_search_searxng",
    "web_answer",
  ])
    assert.equal(youtube(registered, name).defaultActive, false, name);

  for (const value of ["0", "false", "off", "no", "FALSE"])
    for (const name of ["youtube_search", "youtube_transcript"])
      assert.equal(
        youtube(register({ DISCOVERY_YOUTUBE_ENABLED: value }), name).defaultActive,
        false,
        `${value} ${name}`,
      );
  assert.equal(
    youtube(register({ DISCOVERY_YOUTUBE_ENABLED: "1" }), "youtube_search")
      .defaultActive,
    true,
  );
  assert.ok(youtubeSearchDefinition.outputSchema);
  assert.ok(youtubeTranscriptDefinition.outputSchema);
  assert.ok(youtubeSearchDefinition.parameters);
  assert.ok(youtubeTranscriptDefinition.parameters);
});

test("search success keeps every typed result and validates the output schema", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(searchResponse)),
  );
  const tool = youtube(register(), "youtube_search");
  const result = await tool.execute("call", { query: "python 3.13" });
  assert.equal(result.isError, false);
  const details = result.details as {
    status: string;
    response: typeof searchResponse;
  };
  assert.equal(details.status, "ok");
  assert.deepEqual(details.response, searchResponse);
  assert.deepEqual(result.structuredContent, details);
  assert.ok(Check(tool.outputSchema as never, result.structuredContent as never));
  assert.match(text(result), /Python 3.13 release/);
  assert.match(text(result), /no continuation/i);
});

test("transcript success preserves segments and text renderings", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(segmentResponse)),
  );
  const tool = youtube(register(), "youtube_transcript");
  const segments = await tool.execute("call", { video_id: "dQw4w9WgXcQ" });
  assert.equal(segments.isError, false);
  assert.equal((segments.details as { status: string }).status, "ok");
  assert.deepEqual(
    (segments.details as { response: unknown }).response,
    segmentResponse,
  );
  assert.ok(Check(tool.outputSchema as never, segments.structuredContent as never));
  assert.match(text(segments), /Hello and welcome/);

  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(textResponse)),
  );
  const joined = await tool.execute("call", {
    video_id: "dQw4w9WgXcQ",
    format: "text",
  });
  assert.equal(joined.isError, false);
  assert.ok(Check(tool.outputSchema as never, joined.structuredContent as never));
  assert.match(text(joined), /Served from this worker's transcript cache/);
  assert.match(text(joined), /truncated the returned rendering at max_chars/);
});

test("404 outcomes are typed not_found, not generic errors", async (t) => {
  for (const code of ["youtube_no_captions", "youtube_unavailable"]) {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: { code, message: "hidden", request_id: "r", reason: "live" },
          }),
          { status: 404 },
        ),
    );
    const tool = youtube(register(), "youtube_transcript");
    const result = await tool.execute("call", { video_id: "dQw4w9WgXcQ" });
    assert.equal(result.isError, false, code);
    const details = result.details as {
      status: string;
      error: { serverCode: string; requestId: string };
    };
    assert.equal(details.status, "not_found");
    assert.equal(details.error.serverCode, code);
    assert.equal(details.error.requestId, "r");
    assert.doesNotMatch(text(result), /hidden/);
    assert.ok(Check(tool.outputSchema as never, result.structuredContent as never));
  }
});

test("blocked, disabled and malformed failures become stable error envelopes", async (t) => {
  const cases: Array<[number, string, string, string]> = [
    [401, "youtube_disabled", "disabled", "YouTube acquisition is disabled"],
    [502, "youtube_blocked", "blocked", "blocked"],
    [502, "youtube_upstream", "upstream", "YouTube request failed"],
    [504, "youtube_timeout", "timeout", "deadline"],
    [429, "youtube_queue_full", "queue_full", "capacity is full"],
  ];
  for (const [status, serverCode, code, expected] of cases) {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: serverCode,
              message: "RAW",
              request_id: "r",
              reason: serverCode === "youtube_blocked" ? "bot_check" : undefined,
            },
          }),
          {
            status,
            headers: status === 429 ? { "Retry-After": "1" } : undefined,
          },
        ),
    );
    const tool = youtube(register(), "youtube_search");
    const result = await tool.execute("call", { query: "x" });
    assert.equal(result.isError, true, serverCode);
    const details = result.details as {
      status: string;
      error: { code: string; serverCode: string; retryAfterMs?: number };
    };
    assert.equal(details.status, "error");
    assert.equal(details.error.code, code);
    assert.equal(details.error.serverCode, serverCode);
    if (status === 429) assert.equal(details.error.retryAfterMs, 1000);
    assert.ok(text(result).includes(expected), expected);
    assert.doesNotMatch(text(result), /RAW/);
    assert.ok(Check(tool.outputSchema as never, result.structuredContent as never));
  }
});

test("caller cancellation remains AbortError and does not become a tool error", async () => {
  const controller = new AbortController();
  controller.abort();
  const tool = youtube(register(), "youtube_search");
  await assert.rejects(
    tool.execute("call", { query: "x" }, controller.signal),
    { name: "AbortError" },
  );
});

test("collapsed TUI renders one summary line and expanded uses text content", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(searchResponse)),
  );
  const tool = youtube(register(), "youtube_search");
  const result = await tool.execute("call", { query: "x" });
  const collapsed = tool.renderResult(result, { expanded: false });
  assert.equal(collapsed.render(100).length, 1);
  const expanded = tool.renderResult(result, { expanded: true });
  assert.ok(expanded.render(100).length > 1);
});
