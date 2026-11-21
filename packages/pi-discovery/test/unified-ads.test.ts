import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { registerAdLibrary } from "../src/features/ad-library/tools.js";
import {
  adLibraryDefinition,
  type AdLibraryToolParams,
} from "../src/features/ad-library/unified.js";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

type Tool = {
  name: string;
  execute(
    id: string,
    args: AdLibraryToolParams,
  ): Promise<AgentToolResult<unknown>>;
};
const registered: Tool[] = [];
registerAdLibrary({ registerTool: (t: Tool) => registered.push(t) } as never);
const tool = registered.find((t) => t.name === "ad_library")!;
async function call(params: AdLibraryToolParams) {
  assert.ok(Check(adLibraryDefinition.parameters, params));
  const result = await tool.execute("test", params);
  assert.ok(Check(adLibraryDefinition.outputSchema, result.structuredContent));
  return {
    data: result.structuredContent as {
      next_request?: AdLibraryToolParams;
      response?: { ads: unknown[] };
      status: string;
    },
    text: result.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n"),
  };
}
const base = {
  id: "receipt",
  mode: "keyword",
  query: "test",
  country: "US",
  ads: [],
  pages: [],
  failed_pages: [],
  truncation: [],
  truncated: false,
  partial: false,
  timings: { queue_ms: 0, upstream_ms: 1, total_ms: 1 },
};
test("registered tool round-trips provider defaults, filters, and opaque cursors", async (t) => {
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    const pagination = {
      complete: !!body.cursor,
      next_cursor: body.cursor ? null : "opaque+token",
      dropped: 0,
    };
    if (url.endsWith("/linkedin/search"))
      return Response.json({
        ...base,
        ...pagination,
        provider: "linkedin_ad_library",
        sort: "newest",
        date_option: null,
        total_ads: null,
        advertisers: [],
        max_ads_adjustment: null,
        cap_reason: null,
        transparency: null,
      });
    assert.ok(url.endsWith("/v1/ad-library/search"));
    return Response.json({
      ...base,
      ...pagination,
      provider: "meta_ad_library",
      resolved_page: null,
      active_only: body.active_only,
    });
  });
  const cases: AdLibraryToolParams[] = [
    { platform: "meta", keyword: "test", active_only: false },
    { platform: "meta", page_id: "123", max_ads: 48 },
    { platform: "linkedin", payer: "Test", country: "DE" },
    { platform: "linkedin", account_owner: "Test", max_ads: 48 },
  ];
  for (const args of cases) {
    const first = await call(args);
    const limit = args.max_ads ?? (args.platform === "meta" ? 10 : 24);
    const body = requests.at(-1);
    assert.equal(body?.max_ads, limit);
    assert.deepEqual(first.data.next_request, {
      ...args,
      max_ads: limit,
      cursor: "opaque+token",
    });
    assert.ok(first.text.includes(JSON.stringify(first.data.next_request)));
    const last = await call(first.data.next_request!);
    assert.deepEqual(requests.at(-1), { ...body, cursor: "opaque+token" });
    assert.equal(last.data.next_request, undefined);
  }
  const domain = await call({ platform: "meta", domain: "example.com" });
  assert.equal(domain.data.next_request, undefined);
});
test("incompatible selectors fail locally with a correction", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const params of [
    { platform: "meta", country: "ALL", keyword: "x" },
    { platform: "linkedin", domain: "example.com" },
    { platform: "linkedin", payer: "x", end_date: "2026-10-01" },
  ] as const) {
    const result = await call(params);
    assert.equal(result.data.status, "error");
    assert.match(result.text, /country|account_owner|date_option/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("company links, personal profiles and scoped failures", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: {
          code: "ad_library_blocked",
          request_id: "req-1",
          stage: "initial_results",
          resolved_page_id: "123",
        },
      },
      { status: 502 },
    ),
  );
  for (const linkedin_url of [
    "linkedin.com/company/Example",
    "HTTP://de.linkedin.com/company/123/mycompany/",
    "Example",
  ]) {
    const result = await call({ platform: "linkedin", linkedin_url });
    assert.match(result.text, /blocked.*123.*initial_results.*req-1/);
  }
  for (const linkedin_url of [
    "linkedin.com/in/example",
    "https://linkedin.com.evil.com/company/example",
  ]) {
    const result = await call({ platform: "linkedin", linkedin_url });
    assert.match(result.text, /account_owner/);
  }
  assert.equal(fetch.mock.callCount(), 3);
});
