import assert from "node:assert/strict";
import { test } from "node:test";
import { Check } from "typebox/value";
import discovery from "../src/index.js";
import {
  socialPostDefinition,
  socialProfileDefinition,
  socialProfilePostsDefinition,
} from "../src/social-tools.js";
import { formatSocialProfile, formatSocialProfilePosts } from "../src/social-format.js";
import {
  completedSample,
  postResponse,
  profileResponse,
  sampleResponse,
} from "./social-fixtures.js";

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
    result: { isError?: boolean; content: Array<{ type: string; text?: string }> },
    options: { expanded: boolean },
  ) => { render: (width: number) => string[] };
};

function register(env: NodeJS.ProcessEnv = {}): Registered[] {
  const saved = {
    social: process.env.DISCOVERY_SOCIAL_ENABLED,
    searxng: process.env.DISCOVERY_WEB_SEARCH_ENABLED,
    answer: process.env.DISCOVERY_WEB_ANSWER_ENABLED,
    ads: process.env.DISCOVERY_AD_LIBRARY_ENABLED,
  };
  delete process.env.DISCOVERY_WEB_SEARCH_ENABLED;
  delete process.env.DISCOVERY_WEB_ANSWER_ENABLED;
  delete process.env.DISCOVERY_AD_LIBRARY_ENABLED;
  if (env.DISCOVERY_SOCIAL_ENABLED === undefined)
    delete process.env.DISCOVERY_SOCIAL_ENABLED;
  else process.env.DISCOVERY_SOCIAL_ENABLED = env.DISCOVERY_SOCIAL_ENABLED;
  const registered: Registered[] = [];
  try {
    discovery({
      registerTool: (tool: Registered) => registered.push(tool),
    } as unknown as import("@earendil-works/pi-coding-agent").ExtensionAPI);
  } finally {
    for (const [key, value] of [
      ["DISCOVERY_SOCIAL_ENABLED", saved.social],
      ["DISCOVERY_WEB_SEARCH_ENABLED", saved.searxng],
      ["DISCOVERY_WEB_ANSWER_ENABLED", saved.answer],
      ["DISCOVERY_AD_LIBRARY_ENABLED", saved.ads],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return registered;
}

const social = (tools: Registered[], name: string): Registered =>
  tools.find((tool) => tool.name === name)!;

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

test("registers three default-off social tools without changing existing tools", () => {
  const registered = register();
  assert.deepEqual(
    registered.map((tool) => tool.name),
    [
      "ad_library_keyword_ads",
      "ad_library_domain_ads",
      "social_profile",
      "social_profile_posts",
      "social_post",
      "web_search_searxng",
      "web_answer",
    ],
  );
  for (const tool of registered) assert.equal(tool.defaultActive, false, tool.name);
  for (const name of ["social_profile", "social_profile_posts", "social_post"]) {
    const tool = social(registered, name);
    assert.ok(tool.outputSchema, name);
    assert.ok(tool.parameters, name);
  }

  const enabled = register({ DISCOVERY_SOCIAL_ENABLED: "1" });
  for (const name of ["social_profile", "social_profile_posts", "social_post"])
    assert.equal(social(enabled, name).defaultActive, true, name);
  for (const name of ["ad_library_keyword_ads", "web_search_searxng", "web_answer"])
    assert.equal(social(enabled, name).defaultActive, false, name);

  assert.equal(
    social(register({ DISCOVERY_SOCIAL_ENABLED: "true" }), "social_post").defaultActive,
    true,
  );
  assert.equal(
    social(register({ DISCOVERY_SOCIAL_ENABLED: "0" }), "social_post").defaultActive,
    false,
  );
});

test("route-specific parameters expose only their own fields and strict bounds", () => {
  const profile = socialProfileDefinition.parameters as unknown as {
    anyOf: Array<{ properties: Record<string, unknown>; additionalProperties: boolean }>;
  };
  const sample = socialProfilePostsDefinition.parameters as unknown as typeof profile;
  const post = socialPostDefinition.parameters as unknown as typeof profile;
  assert.deepEqual(
    profile.anyOf.map((variant) => Object.keys(variant.properties).sort()),
    [
      ["platform", "timeout_ms", "username"],
      ["platform", "timeout_ms", "url"],
    ],
  );
  assert.deepEqual(
    sample.anyOf.map((variant) => Object.keys(variant.properties).sort()),
    [
      ["max_posts", "platform", "timeout_ms", "username"],
      ["max_posts", "platform", "timeout_ms", "url"],
    ],
  );
  assert.deepEqual(
    post.anyOf.map((variant) => Object.keys(variant.properties).sort()),
    [
      ["platform", "shortcode", "timeout_ms"],
      ["platform", "timeout_ms", "url"],
    ],
  );
  for (const variant of [...profile.anyOf, ...sample.anyOf, ...post.anyOf])
    assert.equal(variant.additionalProperties, false);
  const timeout = profile.anyOf[0].properties.timeout_ms as { anyOf: unknown; maximum: number; minimum: number };
  assert.equal(timeout.minimum, 5000);
  assert.equal(timeout.maximum, 60000);
  const sampleTimeout = sample.anyOf[0].properties.timeout_ms as { maximum: number };
  assert.equal(sampleTimeout.maximum, 180000);
  const maxPosts = sample.anyOf[0].properties.max_posts as {
    maximum: number;
    minimum: number;
  };
  assert.equal(maxPosts.minimum, 1);
  assert.equal(maxPosts.maximum, 50);
});

test("successful structured output keeps every typed field and validates", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(profileResponse)),
  );
  const tool = social(register(), "social_profile");
  const result = await tool.execute("call", { username: "lovelaurieb" });
  assert.equal(result.isError, false);
  const details = result.details as { status: string; requestId: string; response: unknown };
  assert.equal(details.status, "ok");
  assert.equal(details.requestId, "a1b2");
  assert.deepEqual(details.response, profileResponse);
  assert.deepEqual(result.structuredContent, details);
  assert.ok(Check(tool.outputSchema as never, result.structuredContent as never));
  assert.match(text(result), /https:\/\/www\.instagram\.com\/lovelaurieb\//);
  assert.match(text(result), /Line one/);
});

test("partial sample output is not an error and keeps every returned record", async (t) => {
  const payload = completedSample(50);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify(payload));
  });
  const tool = social(register(), "social_profile_posts");
  const result = await tool.execute("call", { username: "lovelaurieb" });
  const details = result.details as {
    status: string;
    response: { posts: unknown[]; returned_posts: number };
  };
  assert.equal(result.isError, false);
  assert.equal(details.status, "ok");
  assert.equal(details.response.posts.length, 50);
  assert.equal(details.response.returned_posts, 50);
  assert.ok(Check(tool.outputSchema as never, result.structuredContent as never));
  assert.equal(calls, 1);

  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(sampleResponse)),
  );
  const partial = await tool.execute("call", { username: "lovelaurieb" });
  assert.equal(partial.isError, false);
  assert.equal((partial.details as { status: string }).status, "partial");
  assert.ok(Check(tool.outputSchema as never, partial.structuredContent as never));
  const partialResponse = (partial.details as { response: typeof sampleResponse }).response;
  assert.equal(partialResponse.profile.id, sampleResponse.profile.id);
  assert.equal(partialResponse.posts.length, 1);
  assert.equal(partialResponse.failed_posts[0].shortcode, "Deleted01");
  assert.equal(partialResponse.sample_failure?.retry_after_s, 0);
  assert.equal(partialResponse.has_more_posts, null);
  assert.match(text(partial), /Partial is not a retry signal/);
  assert.match(text(partial), /continuation: unknown/);
});

test("404 and other failures map to typed statuses with exact server codes", async (t) => {
  const tool = social(register(), "social_post");
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ error: { code: "social_post_not_found", request_id: "safe" } }),
        { status: 404 },
      ),
  );
  const missing = await tool.execute("call", { shortcode: "DfSl0YxhJiA" });
  assert.equal(missing.isError, true);
  assert.equal((missing.details as { status: string }).status, "not_found");
  assert.equal(
    (missing.details as { error: { serverCode: string } }).error.serverCode,
    "social_post_not_found",
  );
  assert.match(text(missing), /social_post_not_found/);
  assert.ok(Check(tool.outputSchema as never, missing.structuredContent as never));

  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: { code: "social_rate_limited", request_id: "safe", reason: null },
        }),
        { status: 429, headers: { "Retry-After": "60" } },
      ),
  );
  const limited = await tool.execute("call", { shortcode: "DfSl0YxhJiA" });
  assert.equal(limited.isError, true);
  const error = (limited.details as {
    status: string;
    error: { retryAfterMs: number; serverCode: string };
  }).error;
  assert.equal((limited.details as { status: string }).status, "error");
  assert.equal(error.serverCode, "social_rate_limited");
  assert.equal(error.retryAfterMs, 60000);
  assert.match(text(limited), /Advisory retry after 60 s/);
  assert.ok(Check(tool.outputSchema as never, limited.structuredContent as never));

  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: { code: "social_disabled" } }), {
        status: 401,
      }),
  );
  const disabled = await tool.execute("call", { shortcode: "DfSl0YxhJiA" });
  assert.equal(disabled.isError, true);
  assert.equal((disabled.details as { status: string }).status, "error");
  assert.equal(
    (disabled.details as { error: { serverCode: string } }).error.serverCode,
    "social_disabled",
  );
});

test("profile-posts 404 keeps the profile route's exact code", async (t) => {
  const tool = social(register(), "social_profile_posts");
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: { code: "social_profile_not_found" } }), {
        status: 404,
      }),
  );
  const result = await tool.execute("call", { username: "lovelaurieb" });
  assert.equal(result.isError, true);
  assert.equal((result.details as { status: string }).status, "not_found");
  assert.equal(
    (result.details as { error: { serverCode: string } }).error.serverCode,
    "social_profile_not_found",
  );
});

test("single post output preserves media references, author and hidden counts", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(postResponse)),
  );
  const tool = social(register(), "social_post");
  const result = await tool.execute("call", { shortcode: "DfSl0YxhJiA" });
  assert.deepEqual((result.details as { response: unknown }).response, postResponse);
  assert.ok(Check(tool.outputSchema as never, result.structuredContent as never));
  const body = text(result);
  assert.match(body, /by @actual_author/);
  assert.match(body, /Likes: hidden/);
  assert.match(body, /Comments: 4/);
  assert.match(body, /Views: unknown/);
  assert.match(body, /https:\/\/cdn\.example\/thumb\.jpg\?token=x/);
  assert.match(body, /Carousel: 1 item$/m);
});

test("model-visible sample text is bounded, explicit and never claims a latest feed", () => {
  const formatted = formatSocialProfilePosts(completedSample(50));
  const text = formatted.text;
  assert.ok(text.length <= 12000, String(text.length));
  assert.match(text, /Text previews shortened: showing 5\/50 post records/);
  assert.match(text, /… \[text shortened\]/);
  assert.match(text, /@actual_author/);
  assert.doesNotMatch(text, /@lovelaurieb \(author/);
  assert.match(text, /not a latest-chronological feed/);
  assert.equal(formatted.details.response?.posts.length, 50);
  assert.equal(formatted.summary.split("\n").length, 1);
  assert.match(formatted.summary, /50\/50 posts/);
});

test("profile text bounds bio links and labels the shortening", () => {
  const formatted = formatSocialProfile({
    ...profileResponse,
    profile: {
      ...profileResponse.profile,
      bio_links: Array.from({ length: 5 }, (_, index) => ({
        url: `https://shop.example/${index}`,
        title: null,
        type: null,
      })),
    },
  });
  assert.match(formatted.text, /Bio links shortened: showing 3\/5/);
  assert.equal(formatted.details.response?.profile.bio_links.length, 5);
});

test("sample text shows null, zero and hidden counts plus private and expiry guidance", () => {
  const formatted = formatSocialProfilePosts({
    ...sampleResponse,
    profile: { ...sampleResponse.profile, is_private: true, post_count: null },
    warnings: [
      "pinned_posts_may_lead",
      "posts_unavailable",
      "like_counts_hidden",
      "media_urls_expire",
    ],
  });
  const body = formatted.text;
  assert.match(body, /unknown posts/);
  assert.match(body, /0 following/);
  assert.match(body, /private/);
  assert.match(body, /Warnings: pinned_posts_may_lead, posts_unavailable, like_counts_hidden, media_urls_expire/);
  assert.match(body, /may expire/);
  assert.match(body, /truncated \(page_failure\)/);
  assert.match(body, /retry_after_s=0/);
  assert.match(body, /social_post_not_found/);
});

test("collapsed TUI renders one summary line and expanded uses the text content", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(sampleResponse)),
  );
  const tool = social(register(), "social_profile_posts");
  const result = await tool.execute("call", { username: "lovelaurieb" });
  const collapsed = tool.renderResult(result, { expanded: false }).render(400);
  assert.equal(collapsed.length, 1);
  assert.match(collapsed[0], /Instagram profile-posts sample @lovelaurieb/);
  const expanded = tool.renderResult(result, { expanded: true }).render(400);
  assert.ok(expanded.length > 1);
  assert.match(expanded.join("\n"), /Profile @lovelaurieb/);
});
