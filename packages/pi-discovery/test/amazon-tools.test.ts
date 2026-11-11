import assert from "node:assert/strict";
import { test } from "node:test";
import { Check } from "typebox/value";
import discovery from "../src/index.js";
import {
  amazonNewReleasesDefinition,
  amazonProductDefinition,
  amazonSearchDefinition,
} from "../src/amazon-tools.js";
import {
  cachedNewReleasesResponse,
  newReleasesResponse,
  productResponse,
  searchResponse,
  usage,
} from "./amazon-fixtures.js";

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
  "DISCOVERY_AMAZON_ENABLED",
] as const;

function register(env: NodeJS.ProcessEnv = {}): Registered[] {
  const saved = Object.fromEntries(
    savedKeys.map((key) => [key, process.env[key]]),
  );
  for (const key of savedKeys) delete process.env[key];
  if (env.DISCOVERY_AMAZON_ENABLED !== undefined)
    process.env.DISCOVERY_AMAZON_ENABLED = env.DISCOVERY_AMAZON_ENABLED;
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

const amazon = (tools: Registered[], name: string): Registered =>
  tools.find((tool) => tool.name === name)!;

function text(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

test("registers three default-off Amazon tools behind DISCOVERY_AMAZON_ENABLED", () => {
  const registered = register();
  assert.deepEqual(
    registered.map((tool) => tool.name),
    [
      "ad_library_keyword_ads",
      "ad_library_domain_ads",
      "amazon_new_releases",
      "amazon_search",
      "amazon_product",
      "social_profile",
      "social_profile_posts",
      "social_post",
      "youtube_search",
      "youtube_transcript",
      "youtube_video",
      "youtube_channel",
      "web_search_searxng",
      "web_answer",
    ],
  );
  for (const name of ["amazon_new_releases", "amazon_search", "amazon_product"])
    assert.equal(amazon(registered, name).defaultActive, false, name);

  for (const value of ["1", "true", "TRUE "])
    for (const name of [
      "amazon_new_releases",
      "amazon_search",
      "amazon_product",
    ])
      assert.equal(
        amazon(register({ DISCOVERY_AMAZON_ENABLED: value }), name)
          .defaultActive,
        true,
        `${value} ${name}`,
      );
  for (const value of ["0", "false", "off", "no", ""])
    assert.equal(
      amazon(register({ DISCOVERY_AMAZON_ENABLED: value }), "amazon_search")
        .defaultActive,
      false,
      value,
    );

  assert.ok(amazonNewReleasesDefinition.outputSchema);
  assert.ok(amazonSearchDefinition.outputSchema);
  assert.ok(amazonProductDefinition.outputSchema);
  assert.ok(amazonNewReleasesDefinition.parameters);
  assert.ok(amazonSearchDefinition.parameters);
  assert.ok(amazonProductDefinition.parameters);
});

test("New Releases success mirrors details into structuredContent", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(newReleasesResponse)),
  );
  const tool = amazon(register(), "amazon_new_releases");
  const result = await tool.execute("call", { node: "baby-products" });
  assert.equal(result.isError, false);
  const details = result.details as {
    status: string;
    response: typeof newReleasesResponse;
  };
  assert.equal(details.status, "ok");
  assert.deepEqual(details.response, newReleasesResponse);
  assert.deepEqual(result.structuredContent, details);
  assert.ok(
    Check(tool.outputSchema as never, result.structuredContent as never),
  );
  assert.match(text(result), /Amazon New Releases · node baby-products/);
  assert.match(text(result), /B0HQZCTBPW/);
  assert.match(text(result), /no byline or date/i);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("search success keeps usage and the discovery-only caveat", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(searchResponse)),
  );
  const tool = amazon(register(), "amazon_search");
  const result = await tool.execute("call", { keyword: "baby stroller" });
  assert.equal(result.isError, false);
  const details = result.details as {
    status: string;
    response: typeof searchResponse;
  };
  assert.equal(details.status, "ok");
  assert.deepEqual(details.response, searchResponse);
  assert.ok(
    Check(tool.outputSchema as never, result.structuredContent as never),
  );
  assert.match(text(result), /discovery only, not a launch signal/i);
  assert.match(text(result), /241000 decoded bytes · 1 request/);
});

test("cached listings report zero usage and stay schema-valid", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(cachedNewReleasesResponse)),
  );
  const tool = amazon(register(), "amazon_new_releases");
  const result = await tool.execute("call", { page: 1 });
  assert.equal(result.isError, false);
  assert.match(text(result), /served from cache/);
  assert.ok(
    Check(tool.outputSchema as never, result.structuredContent as never),
  );
});

test("product success keeps every detail field and warning", async (t) => {
  const payload = {
    ...productResponse,
    product: {
      ...productResponse.product,
      date_first_available: null,
      warnings: ["date_first_available_missing"],
    },
  };
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(payload)),
  );
  const tool = amazon(register(), "amazon_product");
  const result = await tool.execute("call", { asin: "b0hqzcTBPW" });
  assert.equal(result.isError, false);
  const details = result.details as {
    status: string;
    response: typeof payload;
  };
  assert.equal(details.status, "ok");
  assert.deepEqual(details.response, payload);
  assert.ok(
    Check(tool.outputSchema as never, result.structuredContent as never),
  );
  assert.match(text(result), /Amazon product B0HQZCTBPW/);
  assert.match(text(result), /Manufacturer: ExampleBaby Inc\./);
  assert.match(text(result), /Variation: parent B0HQZCTBPW · count 4/);
  assert.match(text(result), /Warnings: date_first_available_missing/);
  assert.match(text(result), /sparse provider evidence/i);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("New Releases not_found is a normal outcome with product-neutral copy", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "amazon_not_found",
            message: "No public Amazon page was found.",
            request_id: "r",
            reason: "delisted",
          },
        }),
        { status: 404 },
      ),
  );
  const tool = amazon(register(), "amazon_new_releases");
  const result = await tool.execute("call", { page: 2 });
  assert.equal(result.isError, false);
  const details = result.details as {
    status: string;
    error: { serverCode: string; requestId: string; reason: string };
  };
  assert.equal(details.status, "not_found");
  assert.equal(details.error.serverCode, "amazon_not_found");
  assert.equal(details.error.requestId, "r");
  assert.equal(details.error.reason, "delisted");
  assert.match(text(result), /No public Amazon listing page was found/);
  assert.match(text(result), /not a retry signal/);
  assert.ok(
    Check(tool.outputSchema as never, result.structuredContent as never),
  );
});

test("product not_found uses ASIN-specific guidance", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "amazon_not_found",
            message: "No public Amazon page was found.",
            request_id: "r",
            reason: "delisted",
          },
        }),
        { status: 404 },
      ),
  );
  const tool = amazon(register(), "amazon_product");
  const result = await tool.execute("call", { asin: "B0HQZCTBPW" });
  assert.equal(result.isError, false);
  assert.equal((result.details as { status: string }).status, "not_found");
  assert.match(text(result), /No public Amazon product page was found/);
  assert.doesNotMatch(text(result), /listing page/);
  assert.match(text(result), /Reason: delisted/);
});

test("disabled, blocked, queue, timeout and malformed failures are error envelopes", async (t) => {
  const cases: Array<[number, string, string, string]> = [
    [401, "amazon_disabled", "disabled", "disabled by the server gate"],
    [502, "amazon_blocked", "blocked", "blocked by the provider or proxy"],
    [502, "amazon_upstream", "upstream", "Amazon upstream failed"],
    [504, "amazon_timeout", "timeout", "exceeded the server deadline"],
    [429, "amazon_queue_full", "queue_full", "capacity is full"],
    [400, "amazon_invalid_request", "invalid_request", "rejected"],
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
              reason:
                serverCode === "amazon_blocked"
                  ? "browser_check"
                  : serverCode === "amazon_upstream"
                    ? "layout_change"
                    : undefined,
            },
            usage,
          }),
          {
            status,
            headers: status === 429 ? { "Retry-After": "1" } : undefined,
          },
        ),
    );
    const tool = amazon(register(), "amazon_search");
    const result = await tool.execute("call", { keyword: "x" });
    assert.equal(result.isError, true, serverCode);
    const details = result.details as {
      status: string;
      error: {
        code: string;
        serverCode: string;
        retryAfterMs?: number;
        usage?: { requests: number };
      };
    };
    assert.equal(details.status, "error");
    assert.equal(details.error.code, code);
    assert.equal(details.error.serverCode, serverCode);
    assert.equal(details.error.usage?.requests, 1);
    if (status === 429) {
      assert.equal(details.error.retryAfterMs, 1000);
      assert.match(
        text(result),
        /Advisory retry after 1 s; this client does not retry or wait\./,
      );
    }
    assert.ok(text(result).includes(expected), expected);
    assert.doesNotMatch(text(result), /RAW/);
    assert.ok(
      Check(tool.outputSchema as never, result.structuredContent as never),
    );
  }
});

test("malformed success bodies become isError envelopes", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ ...productResponse, usage: null })),
  );
  const tool = amazon(register(), "amazon_product");
  const result = await tool.execute("call", { asin: "B0HQZCTBPW" });
  assert.equal(result.isError, true);
  const details = result.details as {
    status: string;
    error: { code: string };
  };
  assert.equal(details.status, "error");
  assert.equal(details.error.code, "malformed");
  assert.match(text(result), /malformed success response/);
  assert.ok(
    Check(tool.outputSchema as never, result.structuredContent as never),
  );
});

test("invalid parameters are rejected before dispatch", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}"),
  );
  const search = amazon(register(), "amazon_search");
  const bareSlug = await search.execute("call", {
    keyword: "x",
    node: "baby-products",
  });
  assert.equal(bareSlug.isError, true);
  assert.equal(
    (bareSlug.details as { error: { code: string } }).error.code,
    "invalid_request",
  );
  assert.match(text(bareSlug), /rejected before dispatch/);

  const releases = amazon(register(), "amazon_new_releases");
  const badPage = await releases.execute("call", { page: 9 });
  assert.equal(badPage.isError, true);

  const product = amazon(register(), "amazon_product");
  const badAsin = await product.execute("call", { asin: "short" });
  assert.equal(badAsin.isError, true);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("caller cancellation remains AbortError and never becomes a tool error", async () => {
  const controller = new AbortController();
  controller.abort();
  const tool = amazon(register(), "amazon_search");
  await assert.rejects(
    tool.execute("call", { keyword: "x" }, controller.signal),
    { name: "AbortError" },
  );
});

test("collapsed TUI renders one summary line and expanded uses the text", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(newReleasesResponse)),
  );
  const tool = amazon(register(), "amazon_new_releases");
  const result = await tool.execute("call", { node: "baby-products" });
  const collapsed = tool.renderResult(result, { expanded: false }).render(400);
  assert.equal(collapsed.length, 1);
  assert.match(collapsed[0], /Amazon New Releases/);
  const expanded = tool.renderResult(result, { expanded: true }).render(400);
  assert.ok(expanded.length > 1);
});

test("tool parameter schemas expose only their documented bounds", () => {
  const releases = amazonNewReleasesDefinition.parameters as unknown as {
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
  const search =
    amazonSearchDefinition.parameters as unknown as typeof releases;
  const product =
    amazonProductDefinition.parameters as unknown as typeof releases;
  assert.deepEqual(Object.keys(releases.properties).sort(), [
    "node",
    "page",
    "timeout_ms",
  ]);
  assert.deepEqual(Object.keys(search.properties).sort(), [
    "keyword",
    "node",
    "page",
    "sort",
    "timeout_ms",
  ]);
  assert.deepEqual(Object.keys(product.properties).sort(), [
    "asin",
    "timeout_ms",
  ]);
  for (const parameters of [releases, search, product])
    assert.equal(parameters.additionalProperties, false);
  const page = releases.properties.page as {
    minimum: number;
    maximum: number;
  };
  assert.equal(page.minimum, 1);
  assert.equal(page.maximum, 5);
  const timeout = releases.properties.timeout_ms as {
    minimum: number;
    maximum: number;
  };
  assert.equal(timeout.minimum, 5000);
  assert.equal(timeout.maximum, 60000);
  const asin = product.properties.asin as { pattern: string };
  assert.equal(asin.pattern, "^[A-Za-z0-9]{10}$");
});
