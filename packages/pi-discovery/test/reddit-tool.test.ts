import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import discovery from "../src/index.js";
import { redditParameters } from "../src/reddit-tool.js";
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
