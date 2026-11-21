import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import discovery from "../src/index.js";
import { redditParameters } from "../src/features/reddit/tools.js";
import type { Static } from "typebox";

type Parameters = Static<typeof redditParameters>;
type Result = {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent: Record<string, unknown>;
};
type Tool = {
  name: string;
  defaultActive: boolean;
  execute(
    id: string,
    params: Parameters,
    signal?: AbortSignal,
  ): Promise<Result>;
};

function tool(): Tool {
  const tools: Tool[] = [];
  discovery({
    registerTool: (entry: Tool) => tools.push(entry),
  } as unknown as ExtensionAPI);
  const reddit = tools.find((entry) => entry.name === "reddit");
  assert.ok(reddit);
  return reddit;
}

test("Reddit dispatches four actions to Discovery and returns the source data", async (t) => {
  const reddit = tool();
  assert.equal(reddit.defaultActive, true);
  const cases = [
    [{ action: "search", query: "espresso" }, "search", "posts"],
    [{ action: "thread", post_id: "abc" }, "thread", "comments"],
    [
      { action: "find_subreddits", query: "espresso" },
      "subreddits/search",
      "subreddits",
    ],
    [{ action: "subreddit", subreddit: "espresso" }, "subreddit", "posts"],
  ] as const;
  let observed = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, request: RequestInit) => {
      const [params, path, key] = cases[observed++];
      assert.equal(new URL(url).pathname, `/v1/reddit/${path}`);
      const { action: _action, ...body } = params;
      assert.deepEqual(JSON.parse(request.body as string), body);
      return Response.json({
        schema_version: "reddit.v1",
        source: "reddit_oauth",
        [key]: [],
      });
    },
  );
  for (const [params] of cases) {
    const result = await reddit.execute("test", params);
    assert.equal(result.structuredContent.status, "ok");
  }
  assert.equal(observed, 4);
});

test("Reddit previews show available metadata and keep pagination visible", async (t) => {
  const post = {
    title: "Example post",
    url: "https://www.reddit.com/r/espresso/comments/abc/",
    created_utc: 1769904000,
    score: 0,
    comment_count: 0,
  };
  const page = {
    schema_version: "reddit.v1",
    source: "reddit_oauth",
  };
  const responses = [
    { ...page, posts: [post], ranked_candidates: 25 },
    { ...page, post, comments: [], comments_truncated: true },
    { ...page, posts: [], next_cursor: "continue-opaque" },
    {
      ...page,
      source: "web_index",
      next_cursor: "keep-before-cutoff",
      subreddits: Array.from({ length: 8 }, () => ({
        name: "espresso",
        description: "community ".repeat(80),
        example_posts: [
          {
            ...post,
            title: "long ".repeat(100),
            url: "https://www.reddit.com/" + "x".repeat(300),
            created_utc: null,
            score: null,
            comment_count: null,
            index_published_date: "2026-02-02",
            index_engines: ["brave", "duckduckgo"],
          },
          {
            ...post,
            title: "another ".repeat(100),
            url: "https://www.reddit.com/" + "y".repeat(300),
          },
        ],
      })),
    },
  ];
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(responses.shift()),
  );
  const reddit = tool();
  const args = [
    { action: "search", query: "espresso" },
    { action: "thread", post_id: "abc" },
    { action: "search", query: "espresso" },
    { action: "find_subreddits", query: "espresso" },
  ] as const;
  const results = [];
  for (const arg of args)
    results.push((await reddit.execute("test", arg)).content[0].text);
  assert.match(results[0], /25 eligible Reddit relevance candidates/);
  assert.match(results[0], /2026-02-01 UTC · score 0 · 0 comments/);
  assert.match(results[1], /2026-02-01 UTC · score 0 · 0 comments/);
  assert.match(results[1], /bounded comment sample/);
  assert.match(results[2], /0 posts on this page/);
  assert.match(results[2], /Next cursor: continue-opaque/);
  assert.match(results[3], /Next cursor: keep-before-cutoff/);
  assert.match(
    results[3],
    /Index date 2026-02-02 · Source engines: brave, duckduckgo/,
  );
  assert.doesNotMatch(results[3], /1970|score null/);
  assert.ok(results[3].length <= 12000);
});

test("Reddit surfaces rate limiting without retrying", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: { code: "reddit_rate_limited" } },
      {
        status: 429,
        headers: { "Retry-After": "45" },
      },
    ),
  );
  const result = await tool().execute("test", {
    action: "search",
    query: "espresso",
  });
  assert.deepEqual(result.structuredContent, {
    status: "error",
    error: { code: "reddit_rate_limited", status: 429, retry_after_s: 45 },
  });
  assert.equal(result.isError, true);
  assert.equal(fetch.mock.callCount(), 1);
});

test(
  "live Reddit research through the registered tool",
  {
    skip: process.env.DISCOVERY_REDDIT_LIVE !== "1",
  },
  async () => {
    const reddit = tool();
    const run = async (params: Parameters) => {
      const result = await reddit.execute("live", params);
      assert.equal(
        result.structuredContent.status,
        "ok",
        result.content[0].text,
      );
      return result.structuredContent.response as Record<string, unknown>;
    };
    const search = await run({
      action: "search",
      query: "Baratza Encore ESP",
      subreddit: "espresso",
      limit: 3,
    });
    const posts = search.posts as Array<{ url: string }>;
    assert.ok(posts.length > 0);
    const thread = await run({
      action: "thread",
      url: posts[0].url,
      max_comments: 4,
    });
    assert.ok(thread.post);
    const communities = await run({
      action: "find_subreddits",
      query: "espresso",
      limit: 5,
    });
    assert.ok((communities.subreddits as unknown[]).length > 0);
    const subreddit = await run({
      action: "subreddit",
      subreddit: "espresso",
      limit: 3,
    });
    assert.ok((subreddit.posts as unknown[]).length > 0);
  },
);
