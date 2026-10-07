// The host is import-only ESM. Mock registration, but execute the installed host truncator.
jest.mock("@earendil-works/pi-coding-agent", () => {
  const path = require("node:path");
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(source, { format: "cjs" }).code)(module, module.exports);
  return { ...module.exports, defineTool: (tool: unknown) => tool };
}, { virtual: true });

import { mergeConfigWithEnv } from "../../config/loader";
import type { Crawl4AIConfig } from "../../config";
import { registerCrawlTool } from "./crawlTool";
import { resetRequestPacingState } from "./requestPacing";
import { mockFetch, restoreFetch, resetEnv } from "../../test-utils";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CrawlResult, CrawlToolParams } from "./types";
import { existsSync, rmSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { urlToFilePath } from "./saveOutput";
import { MAX_RESPONSE_BYTES } from "./http";

const TEST_SAVE_DIR = "./__test_crawl_save__";
const URL = "https://example.com";
const PAGE: CrawlResult = { url: URL, success: true, markdown: "# Example\n\nThis is example content." };
const registeredTools: any[] = [];

// Consumed fields captured from the actual authenticated 0.9.4 cache-hit response
// /tmp/crawl-contract-enabled-typed-2.json; no runtime dependency on that evidence file.
const CACHED_RESPONSE_094 = {
  success: true,
  results: [{
    url: "https://httpbin.org/base64/PGh0bWw+PGhlYWQ+PHRpdGxlPkFsbG93ZWQgY2hpbGQgbWFya2VyPC90aXRsZT48L2hlYWQ+PGJvZHk+PG1haW4+PGgxPkFsbG93ZWQgY2hpbGQgbWFya2VyPC9oMT48cD5JbnN0YWxsYXRpb24gZXh0ZW5zaW9uIGRvY3VtZW50YXRpb24gZGVzY3JpYmVzIGJyb3dzZXIgcmVuZGVyaW5nLCBjb25maWd1cmVkIGRlYWRsaW5lcyBhbmQgcmVwZWF0YWJsZSBzb3VyY2UgcmVjb3ZlcnkuIEluc3RhbGxhdGlvbiBleHRlbnNpb24gZG9jdW1lbnRhdGlvbiBkZXNjcmliZXMgYnJvd3NlciByZW5kZXJpbmcsIGNvbmZpZ3VyZWQgZGVhZGxpbmVzIGFuZCByZXBlYXRhYmxlIHNvdXJjZSByZWNvdmVyeS4gSW5zdGFsbGF0aW9uIGV4dGVuc2lvbiBkb2N1bWVudGF0aW9uIGRlc2NyaWJlcyBicm93c2VyIHJlbmRlcmluZywgY29uZmlndXJlZCBkZWFkbGluZXMgYW5kIHJlcGVhdGFibGUgc291cmNlIHJlY292ZXJ5LiA8L3A+PHAgaWQ9ImRlbGF5ZWQiPmJlZm9yZS1tYXJrZXI8L3A+PC9tYWluPjwvYm9keT48L2h0bWw+",
    success: true,
    html: '<html><head><title>Allowed child marker</title></head><body><main><h1>Allowed child marker</h1><p>Installation extension documentation describes browser rendering, configured deadlines and repeatable source recovery. Installation extension documentation describes browser rendering, configured deadlines and repeatable source recovery. Installation extension documentation describes browser rendering, configured deadlines and repeatable source recovery. </p><p id="delayed">before-marker</p></main></body></html>',
    links: { internal: [], external: [] },
    metadata: { title: "Allowed child marker", description: null, keywords: null, author: null },
    error_message: null,
    status_code: null,
    response_headers: { "content-type": "text/html; charset=utf-8", "content-length": "513" },
    markdown: {
      raw_markdown: "# Allowed child marker\nInstallation extension documentation describes browser rendering, configured deadlines and repeatable source recovery. Installation extension documentation describes browser rendering, configured deadlines and repeatable source recovery. Installation extension documentation describes browser rendering, configured deadlines and repeatable source recovery. \nbefore-marker\n",
      markdown_with_citations: "", references_markdown: "", fit_markdown: "", fit_html: "",
    },
    cache_status: "hit", cached_at: 1790766044.9991624,
    session_id: null, js_execution_result: null, redirected_status_code: null, crawl_stats: null,
  }],
};

function createTool(timeout = 60000, mutate?: (config: Crawl4AIConfig) => void) {
  const raw = mergeConfigWithEnv({ outputDir: TEST_SAVE_DIR, retention: { enabled: false } });
  const config: Crawl4AIConfig = { baseUrl: raw.baseUrl, timeout, apiToken: raw.apiToken, raw };
  mutate?.(config);
  const pi = { registerTool: (tool: unknown) => registeredTools.push(tool) } as unknown as ExtensionAPI;
  registerCrawlTool(pi, config);
  return registeredTools.at(-1);
}
function respond(results: CrawlResult[] = [PAGE]) { return mockFetch({ data: { success: true, results } }); }
function invoke(params: Partial<CrawlToolParams> = {}, tool = createTool(), signal?: AbortSignal, ctx = { cwd: process.cwd() }) {
  return tool.execute("id", { urls: [URL], ...params }, signal, undefined, ctx);
}

beforeEach(() => { resetEnv(); resetRequestPacingState(); registeredTools.length = 0; });
afterEach(() => { rmSync(TEST_SAVE_DIR, { recursive: true, force: true }); restoreFetch(); jest.useRealTimers(); });

describe("crawl reliability regressions", () => {
  it("uses fixed preview and deep-page defaults despite obsolete environment settings", async () => {
    const settings = {
      CRAWL4AI_RETURN_MODE: "files", CRAWL4AI_MAX_CHARS_PER_PAGE: "1", CRAWL4AI_MAX_CHARS_PER_CALL: "1",
      CRAWL4AI_PREFER_FIT_MARKDOWN: "false", CRAWL4AI_DEEP_CRAWL_DEFAULT_MAX_PAGES: "99", CRAWL4AI_EXCERPT_CHARS: "1",
    };
    const previous = Object.keys(settings).map(name => process.env[name]);
    try {
      Object.assign(process.env, settings);
      const fetchMock = respond([{ ...PAGE, markdown: { raw_markdown: "RAW", fit_markdown: "FIT".repeat(10000), markdown_with_citations: "", references_markdown: "" } }]);
      const result = await invoke({ save: false, deepCrawl: { maxDepth: 1 } });
      expect(result.details.returnMode).toBe("inline");
      expect(result.details.preview).toEqual({ maxCharsPerPage: 12000, maxCharsPerCall: 12000, returnMode: "auto", preferFitMarkdown: true });
      expect(result.details.totalReturnedChars).toBe(12000);
      expect(result.content[0].text).toContain("FIT"); expect(result.content[0].text).not.toContain("RAW");
      const request = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(request.crawler_config.params.deep_crawl_strategy.params.max_pages).toBe(10);
      expect(result.details).not.toHaveProperty("tokenBudget");
      expect(existsSync(TEST_SAVE_DIR)).toBe(false);
    } finally {
      Object.keys(settings).forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    }
  });
  it("saves a tiny complete page by default and returns references", async () => {
    respond([{ ...PAGE, markdown: "# Tiny\n\nbody" }]);
    const result = await invoke();
    expect(result.details.returnMode).toBe("files");
    expect(readFileSync(result.details.savedFiles[0].path, "utf8")).toBe("# Tiny\n\nbody");
    expect(result.content[0].text).toContain(result.details.manifestPath);
  });
  it("accepts the authentic 0.9.4 cached response with nullable optional fields", async () => {
    mockFetch({ data: CACHED_RESPONSE_094 });
    const result = await invoke({ urls: [CACHED_RESPONSE_094.results[0].url] });
    expect(result.details.results[0]).toMatchObject({ success: true, title: "Allowed child marker" });
    expect(result.details.results[0].statusCode).toBeUndefined();
    expect(result.details.results[0].errorMessage).toBeUndefined();
    expect(readFileSync(result.details.savedFiles[0].path, "utf8")).toBe(CACHED_RESPONSE_094.results[0].markdown.raw_markdown);
  });
  it("normalizes nullable optional Markdown, metadata and header values without requiring fit content", async () => {
    const cached = CACHED_RESPONSE_094.results[0];
    mockFetch({ data: { success: true, results: [{ ...cached, response_headers: null, metadata: { title: null, depth: null, parent_url: null }, markdown: { ...cached.markdown, fit_markdown: null, fit_html: null } }] } });
    const result = await invoke({ save: false });
    expect(result.content[0].text).toContain("Allowed child marker");
    expect(result.details.results[0].statusCode).toBeUndefined();
    expect(result.details.results[0].depth).toBeUndefined();
    expect(result.details.results[0].parentUrl).toBeUndefined();
  });
  it.each([
    { url: null }, { success: null }, { error_message: {} }, { status_code: "200" },
    { status_code: 200.5 }, { metadata: [] }, { response_headers: [] },
    { markdown: { raw_markdown: null } }, { markdown: { raw_markdown: "body", fit_markdown: {} } },
  ])("does not weaken cached-response validation for malformed fields %j", async override => {
    mockFetch({ data: { success: true, results: [{ ...CACHED_RESPONSE_094.results[0], ...override }] } });
    await expect(invoke({ save: false })).rejects.toThrow(/Malformed/);
  });
  it("rejects files plus no-save before a network request", async () => {
    const fetchMock = respond();
    await expect(invoke({ save: false, returnMode: "files" })).rejects.toThrow("save=false");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("treats all failed pages as a real error", async () => {
    respond([{ url: URL, success: false, error_message: "broken" }]);
    await expect(invoke()).rejects.toThrow("broken");
  });
  it("enforces the deadline even when headers never arrive", async () => {
    const fetchMock = jest.fn(() => new Promise(() => {}));
    global.fetch = fetchMock as unknown as typeof fetch;
    const error = await invoke({}, createTool(25)).catch((error: Error) => error);
    expect(error.message).toMatch(/deadline|timed out/i);
    expect(error.message).not.toContain("connection failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("pre-abort makes no POST", async () => {
    const fetchMock = respond();
    const controller = new AbortController(); controller.abort();
    await expect(invoke({}, createTool(), controller.signal)).rejects.toThrow(/cancelled/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels a pending body and removes caller listeners", async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, "removeEventListener");
    const cancel = jest.fn();
    global.fetch = jest.fn(async () => new Response(new ReadableStream({ cancel }))) as typeof fetch;
    const pending = invoke({}, createTool(), controller.signal);
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort();
    const error = await pending.catch((error: Error) => error);
    expect(error.message).toMatch(/cancelled/);
    expect(error.message).not.toContain("connection failed");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    respond(); await expect(invoke({ save: false })).resolves.toBeDefined();
  });
  it("body reading and queued pacing share the configured deadline", async () => {
    const cancel = jest.fn();
    global.fetch = jest.fn(async () => new Response(new ReadableStream({ cancel }))) as typeof fetch;
    await expect(invoke({}, createTool(25))).rejects.toThrow(/deadline/);
    expect(cancel).toHaveBeenCalledTimes(1);
    const tool = createTool(25, config => { config.raw.minRequestIntervalMs = 5000; });
    const fetchMock = respond();
    await invoke({ save: false }, tool);
    await expect(invoke({ save: false }, tool)).rejects.toThrow(/deadline/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetRequestPacingState(); await expect(invoke({ save: false }, tool)).resolves.toBeDefined();
  });
  it.each([
    { success: true }, { success: true, results: [] }, { success: true, results: [{}] },
    { success: true, results: [{ ...PAGE, markdown: 10 }] },
    { success: true, results: [{ ...PAGE, links: { internal: "wrong", external: [] } }] },
  ])("rejects malformed response %j", async data => {
    mockFetch({ data });
    const error = await invoke().catch((error: Error) => error);
    expect(error.message).toMatch(/Malformed/);
    expect(error.message).not.toContain("connection failed");
  });
  it("rejects unsuccessful envelopes and invalid JSON", async () => {
    mockFetch({ data: { success: false, results: [] } }); await expect(invoke()).rejects.toThrow("Crawl request failed");
    mockFetch({ text: "not JSON" }); await expect(invoke()).rejects.toThrow("JSON");
  });
  it("reports partial results and redacts diagnostics", async () => {
    const tool = createTool(60000, config => { config.apiToken = "secret-token"; });
    respond([PAGE, { url: `${URL}/bad`, success: false, error_message: "Bearer secret-token" }]);
    const result = await invoke({}, tool);
    expect(result.details.partial).toBe(true);
    expect(result.content[0].text).toContain("Partial results");
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(result.details.results[1].success).toBe(false);
  });
  it.each([
    { rejection: Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect refused"), { code: "ECONNREFUSED", cause: new Error("nested-secret-marker") }) }), expected: ["fetch failed", "ECONNREFUSED", "connect refused"] },
    { rejection: new TypeError("fetch failed"), expected: ["fetch failed"] },
    { rejection: "socket unavailable", expected: ["socket unavailable"] },
  ])("renders service transport diagnostics and immediate cause only (%#)", async ({ rejection, expected }) => {
    const tool = createTool(60000, config => { config.baseUrl = "http://service.example:11235"; });
    const fetchMock = jest.fn().mockRejectedValue(rejection);
    global.fetch = fetchMock as typeof fetch;
    const error = await invoke({ save: false }, tool).catch((error: Error) => error);
    expect(error.message).toContain("http://service.example:11235");
    for (const value of expected) expect(error.message).toContain(value);
    expect(error.message).not.toContain("nested-secret-marker");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("sanitizes the complete transport diagnostic before bounding it", async () => {
    const endpoint = "http://synthetic-user:synthetic-password@service.example:11235";
    const secret = "secret-token";
    const diagnostic = `${endpoint} ${secret} Bearer ${secret} ${"x".repeat(5000)}`;
    const tool = createTool(60000, config => { config.baseUrl = endpoint; config.apiToken = secret; });
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new TypeError(`fetch failed ${diagnostic}`), {
      cause: Object.assign(new Error(`connect refused ${diagnostic}`), { code: "ECONNREFUSED" }),
    })) as typeof fetch;
    const error = await invoke({ save: false }, tool).catch((error: Error) => error);
    expect(error.message).toContain("http://service.example:11235");
    expect(error.message).toContain("ECONNREFUSED");
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain("synthetic-user");
    expect(error.message).not.toContain("synthetic-password");
    expect(error.message.length).toBeLessThanOrEqual(2000 + "Crawl failed: ".length);
  });
  it("HTTP errors are bounded/redacted and never retried", async () => {
    const tool = createTool(60000, config => { config.apiToken = "secret-token"; });
    const fetchMock = mockFetch({ ok: false, status: 500, text: "Bearer secret-token " + "x".repeat(5000) });
    const error = await invoke({}, tool).catch((error: Error) => error);
    expect(error.message).toContain("crawl4ai API error");
    expect(error.message).not.toContain("connection failed");
    expect(error.message).not.toContain("secret-token");
    expect(error.message.length).toBeLessThan(2100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("surfaces the actual untrusted deep strategy rejection without bypass", async () => {
    const fetchMock = mockFetch({ ok: false, status: 400, text: "Rejected config: type 'BFSDeepCrawlStrategy' may not be constructed from an untrusted request" });
    await expect(invoke({ deepCrawl: { maxDepth: 2 } })).rejects.toThrow("This server rejects deep-crawl configuration");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("bounds streamed response bytes", async () => {
    const cancel = jest.fn();
    global.fetch = jest.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES)); controller.enqueue(new Uint8Array(1)); }, cancel,
    }))) as typeof fetch;
    const error = await invoke().catch((error: Error) => error);
    expect(error.message).toContain("20 MiB");
    expect(error.message).not.toContain("connection failed");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each([
    { urls: ["file:///etc/passwd"] }, { waitFor: NaN }, { maxCharsPerCall: 0 },
    { deepCrawl: { maxDepth: 1.5 } }, { urls: [URL, `${URL}/other`], deepCrawl: { maxDepth: 2 } },
    { deepCrawl: { maxDepth: 2, scoreThreshold: 0.1 } },
    { bm25Threshold: 1 }, { bm25Query: " " }, { bm25Query: "docs", format: "html" },
    { bm25Query: "docs", deepCrawl: { maxDepth: 2 } }, { bm25Query: "docs", urls: [URL, `${URL}/two`] },
    { format: "text" }, { includeLinks: true }, { extractor: "trafilatura", save: false },
  ] as Partial<CrawlToolParams>[])('preflights incompatible/invalid params %j', async params => {
    const fetchMock = respond(); await expect(invoke(params)).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("crawl public contract and transport", () => {
  it("registers a typed schema, progressive guidance and BM25/extractor options", () => {
    const tool = createTool();
    expect(tool.name).toBe("crawl"); expect(tool.parameters.properties.deepCrawl).toBeDefined();
    expect(tool.parameters.properties.bm25Query).toBeDefined(); expect(tool.parameters.properties.extractor).toBeDefined();
    expect(tool.promptSnippet).toContain("index"); expect(tool.promptSnippet).toContain("crawl_read");
  });
  it("crawls a single page without deep traversal", async () => {
    const fetchMock = respond(); const result = await invoke({ save: false });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).crawler_config.params.deep_crawl_strategy).toBeUndefined();
    expect(result.details.deepCrawl).toBeUndefined();
  });
  it("should include deep crawl metadata in result details and depth grouping with failed-page labels", async () => {
    respond([PAGE, { ...PAGE, url: `${URL}/docs`, metadata: { depth: 1 }, markdown: "Docs content" }, { url: `${URL}/broken`, success: false, error_message: "404", metadata: { depth: 1 } }]);
    const result = await invoke({ deepCrawl: { maxDepth: 2 } });
    expect(result.details.deepCrawl).toEqual({ totalPages: 3, maxDepth: 2, maxPages: 10 });
    expect(result.content[0].text).toContain("Deep Crawl Results (3 pages"); expect(result.content[0].text).toContain("Depth 0 (1 pages)"); expect(result.content[0].text).toContain("Depth 1 (2 pages)");
    expect(result.content[0].text).toContain(`[error] ${URL}/broken`); expect(result.content[0].text).toContain(`[ok] ${URL}`);
    const manifest = JSON.parse(readFileSync(result.details.manifestPath, "utf8"));
    expect(manifest.deepCrawl).toEqual({ maxDepth: 2, maxPages: 10 });
  });
  it("should handle multiple URLs and expose every exact saved page path in result order", async () => {
    const pages = [PAGE, { ...PAGE, url: "https://other.com/docs", markdown: "Other content" }];
    respond(pages); const result = await invoke({ urls: pages.map(page => page.url) });
    expect(result.details.results).toHaveLength(2);
    for (const [index, page] of result.details.savedFiles.entries()) {
      expect(result.details.results[index].filePath).toBe(page.path); expect(result.content[0].text).toContain(`${page.url} → ${page.path}`);
      expect(readFileSync(page.path, "utf8")).toBe(pages[index].markdown);
    }
  });
  it("preserves bearer auth and server-managed egress without proxy/browser settings", async () => {
    const tool = createTool(60000, config => { config.baseUrl = "http://localhost:11235/"; config.apiToken = "test-api-token"; });
    const fetchMock = respond(); const result = await invoke({ save: false }, tool);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11235/crawl", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-token" } }));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.urls).toEqual([URL]); expect(payload.browser_config).toBeUndefined(); expect(JSON.stringify(payload)).not.toContain("proxy");
    expect(result.details.execution).toEqual({ egress: "server-managed" });
  });
  it("serializes native run config, seconds delay, JS, and enabled/bypass enums", async () => {
    const fetchMock = respond();
    await invoke({ save: false, waitFor: 1800, jsCode: 'document.title="test"' });
    let payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.crawler_config.type).toBe("CrawlerRunConfig");
    expect(payload.crawler_config.params.delay_before_return_html).toBe(1.8);
    expect(payload.crawler_config.params.wait_for).toBeUndefined();
    expect(payload.crawler_config.params.js_code).toEqual(['document.title="test"']);
    expect(payload.crawler_config.params.cache_mode).toEqual({ type: "CacheMode", params: "enabled" });
    await invoke({ save: false, bypassCache: true });
    payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.crawler_config.params.cache_mode).toEqual({ type: "CacheMode", params: "bypass" });
  });
  it.each(["bfs", "dfs", "best-first"] as const)("translates %s seed depth and maxPages with separate reverse/domain filters", async strategy => {
    const fetchMock = respond();
    await invoke({ save: false, deepCrawl: { strategy, maxDepth: 1, maxPages: 3, includeExternal: true, includePatterns: ["*/docs/*"], excludePatterns: ["*/admin/*"], allowedDomains: ["example.com"], ...(strategy === "best-first" ? { scoreThreshold: 0.5 } : {}) } });
    const deep = JSON.parse(fetchMock.mock.calls[0][1].body).crawler_config.params.deep_crawl_strategy;
    expect(deep.type).toBe({ bfs: "BFSDeepCrawlStrategy", dfs: "DFSDeepCrawlStrategy", "best-first": "BestFirstCrawlingStrategy" }[strategy]);
    expect(deep.params.max_depth).toBe(0); expect(deep.params.max_pages).toBe(3); expect(deep.params.include_external).toBe(true);
    expect(deep.params.filter_chain.params.filters).toEqual([
      { type: "URLPatternFilter", params: { patterns: ["*/docs/*"], use_glob: true } },
      { type: "URLPatternFilter", params: { patterns: ["*/admin/*"], use_glob: true, reverse: true } },
      { type: "DomainFilter", params: { allowed_domains: ["example.com"] } },
    ]);
  });
  it.each(["markdown", "html", "links"] as const)("renders %s inline and saves complete bodies", async format => {
    const result: CrawlResult = { ...PAGE, html: "<html>Example</html>", links: { internal: [{ href: "/about", text: "About" }], external: [] } };
    respond([result]);
    const output = await invoke({ format, returnMode: "inline" });
    expect(output.content[0].text).toContain({ markdown: "This is example content.", html: "<html>", links: "[About](/about)" }[format]);
    expect(existsSync(output.details.savedFiles[0].path)).toBe(true);
  });
  it("honors fit preference without serializing full bodies into details", async () => {
    respond([{ ...PAGE, markdown: { raw_markdown: "RAW body", fit_markdown: "FIT body", markdown_with_citations: "", references_markdown: "" } }]);
    const fit = await invoke({ save: false }); expect(fit.content[0].text).toContain("FIT body"); expect(fit.details.results[0].usedFitMarkdown).toBe(true);
    const raw = await invoke({ save: false, preferFitMarkdown: false }); expect(raw.content[0].text).toContain("RAW body"); expect(raw.details.results[0].usedFitMarkdown).toBe(false);
    expect(JSON.stringify(raw.details)).not.toContain("RAW body");
  });
  it("applies per-process request pacing and brief headless progress", async () => {
    jest.useFakeTimers();
    const tool = createTool(60000, config => { config.raw.minRequestIntervalMs = 5000; });
    const fetchMock = respond(); const onUpdate = jest.fn();
    await tool.execute("first", { urls: [URL], save: false }, undefined, onUpdate, { cwd: process.cwd() });
    const second = invoke({ save: false }, tool);
    await jest.advanceTimersByTimeAsync(4999); expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); const result = await second;
    expect(result.details.rateLimitWaitedMs).toBe(5000); expect(onUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("crawl file-first output and extraction integration", () => {
  it("inline saves the untruncated original and honors smaller preview caps", async () => {
    const body = "x".repeat(30000); respond([{ ...PAGE, markdown: body }]);
    const result = await invoke({ returnMode: "inline", maxCharsPerPage: 100, maxCharsPerCall: 500 });
    expect(result.details.totalReturnedChars).toBeLessThanOrEqual(100); expect(result.details.truncated).toBe(true);
    expect(readFileSync(result.details.savedFiles[0].path, "utf8")).toBe(body);
    expect(result.content[0].text).toContain(result.details.manifestPath);
  });
  it("save=false returns bounded inline with explicit loss warning and writes nothing", async () => {
    respond([{ ...PAGE, markdown: "x".repeat(30000) }]);
    const result = await invoke({ save: false, maxCharsPerPage: 100 });
    expect(result.details.savedPath).toBeUndefined(); expect(result.details.returnMode).toBe("inline");
    expect(result.content[0].text).toContain("not recoverable"); expect(existsSync(TEST_SAVE_DIR)).toBe(false);
  });
  it("defaults total body cap to 12000 even for larger overrides and exhausted pages", async () => {
    respond([PAGE, { ...PAGE, url: `${URL}/2`, markdown: "y".repeat(30000) }, { ...PAGE, url: `${URL}/3`, markdown: "z".repeat(30000) }]);
    const result = await invoke({ save: false, maxCharsPerPage: 1e6, maxCharsPerCall: 1e6 });
    expect(result.details.totalReturnedChars).toBeLessThanOrEqual(12000);
    expect(result.details.results[2].truncated).toBe(true); expect(result.content[0].text).not.toContain("zzzz");
  });
  it("saves all pages but lists at most 20 entries and retains a complete manifest pointer", async () => {
    respond(Array.from({ length: 30 }, (_, index) => ({ ...PAGE, url: `${URL}/${index}` })));
    const result = await invoke();
    expect(result.details.savedFiles).toHaveLength(30);
    expect(result.content[0].text).toContain("first 20"); expect(result.content[0].text).not.toContain(`${URL}/25`);
    expect(result.content[0].text).toContain(result.details.manifestPath);
    expect(JSON.parse(readFileSync(result.details.manifestPath, "utf8")).pages).toHaveLength(30);
  });
  it("resolves custom/default directories from ctx.cwd", async () => {
    mkdirSync(TEST_SAVE_DIR, { recursive: true }); respond();
    const result = await invoke({ save: "nested" }, createTool(), undefined, { cwd: resolve(TEST_SAVE_DIR) });
    expect(result.details.savedPath.startsWith(join(resolve(TEST_SAVE_DIR), "nested"))).toBe(true);
    expect(existsSync(result.details.savedFiles[0].path)).toBe(true);
  });
  it("returns empty content warnings", async () => {
    respond([{ ...PAGE, markdown: "" }]); const result = await invoke();
    expect(readFileSync(result.details.savedFiles[0].path, "utf8")).toBe(""); expect(result.details.warnings).toHaveLength(1);
  });
  it("saves complete structural BM25 selection, source and metadata; no-match is valid", async () => {
    const source = "# Tables\n\n| documentation | value |\n| --- | --- |\n| documentation | full row |\n\n# Other\n\nunrelated pricing";
    respond([{ ...PAGE, markdown: source }]);
    const result = await invoke({ bm25Query: "documentation", bm25Threshold: 0 });
    const saved = result.details.savedFiles[0];
    expect(readFileSync(saved.path, "utf8")).toContain("full row"); expect(readFileSync(saved.path, "utf8")).not.toContain("pricing");
    expect(readFileSync(saved.sourcePath, "utf8")).toBe(source); expect(saved.filter.matchedSectionCount).toBe(1);
    expect(result.content[0].text).toContain(saved.sourcePath);
    const manifest = JSON.parse(readFileSync(result.details.manifestPath, "utf8"));
    expect(manifest.pages[0].sourceFile).toBe(`${urlToFilePath(URL, "markdown")}.source.md`);
    const empty = await invoke({ bm25Query: "no-match", bm25Threshold: 100 });
    expect(readFileSync(empty.details.savedFiles[0].path, "utf8")).toBe(""); expect(empty.details.savedFiles[0].filter.matchedSectionCount).toBe(0);
  });
  it("records effective, secret-free request provenance and redacted failure reasons", async () => {
    const token = "supersecret-token";
    const tool = createTool(60000, config => { config.apiToken = token; config.baseUrl = `http://crawler:${token}@localhost:11235`; });
    respond([
      { ...PAGE, markdown: "# Docs\n\ndocumentation" },
      { url: `${URL}/broken`, success: false, error_message: `Bearer ${token} rejected <script>token=${token}</script>` },
    ]);
    const result = await invoke({ waitFor: 1500, bypassCache: true, jsCode: `document.cookie = "token=${token}"`, deepCrawl: { maxDepth: 2, includeExternal: true, includePatterns: ["*/docs/*"], allowedDomains: ["example.com"] } }, tool);
    const raw = readFileSync(result.details.manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    expect(manifest.request).toEqual({
      format: "markdown",
      bypassCache: true,
      preferFitMarkdown: true,
      waitFor: 1500,
      jsCode: true,
      deepCrawl: { strategy: "bfs", maxDepth: 2, maxPages: 10, includeExternal: true, includePatterns: ["*/docs/*"], allowedDomains: ["example.com"] },
    });
    expect(manifest.deepCrawl).toEqual({ maxDepth: 2, maxPages: 10 });
    expect(manifest.service).toEqual({ baseUrl: "http://localhost:11235" });
    expect(manifest.pages[0]).not.toHaveProperty("error");
    expect(manifest.pages[1].error).toContain("[redacted]");
    expect(raw).not.toContain(token);
    expect(raw).not.toContain("document.cookie");
    const failedBody = readFileSync(result.details.savedFiles[1].path, "utf8");
    expect(failedBody).toContain("[redacted]"); expect(failedBody).not.toContain(token);
  });
  it("requires configured Python before network activity and basic crawling needs none", async () => {
    const fetchMock = respond(); await expect(invoke({ extractor: "trafilatura" })).rejects.toThrow("pythonPath"); expect(fetchMock).not.toHaveBeenCalled();
    await expect(invoke({ save: false })).resolves.toBeDefined();
  });
  it("persists rendered HTML before missing executable errors and never silently falls back", async () => {
    const html = "<html><article><h1>Original</h1><p>source</p></article></html>";
    respond([{ ...PAGE, html }]);
    const tool = createTool(60000, config => { config.raw.trafilatura = { pythonPath: "/__missing_python__" }; });
    const error: Error = await invoke({ extractor: "trafilatura" }, tool).catch((error: Error) => error);
    expect(error.message).toContain("Original HTML:");
    const original = error.message.split("Original HTML: ")[1]; expect(readFileSync(original, "utf8")).toBe(html);
    const session = readdirSync(TEST_SAVE_DIR)[0]; expect(existsSync(join(TEST_SAVE_DIR, session, "crawl-manifest.json"))).toBe(false);
  });
  it("wires configured stdin extractor to text plus BM25 with the original crawl deadline", async () => {
    mkdirSync(TEST_SAVE_DIR, { recursive: true });
    const executable = resolve(TEST_SAVE_DIR, "controlled-python");
    writeFileSync(executable, `#!/usr/bin/env node\nlet input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{if(!input.includes('Rendered source'))process.exit(2);process.stdout.write('# Documentation\\n\\nUseful documentation table\\n\\n# Other\\n\\nPricing');});`, { mode: 0o755 });
    respond([{ ...PAGE, html: "<html>Rendered source</html>" }]);
    const tool = createTool(1000, config => { config.raw.trafilatura = { pythonPath: executable }; });
    const result = await invoke({ extractor: "trafilatura", format: "text", bm25Query: "documentation", bm25Threshold: 0, includeLinks: true }, tool);
    const saved = result.details.savedFiles[0]; expect(saved.path).toMatch(/\.txt$/); expect(readFileSync(saved.path, "utf8")).not.toContain("Pricing");
    expect(readFileSync(saved.sourcePath, "utf8")).toContain("Pricing"); expect(readFileSync(saved.rawHtmlPath, "utf8")).toBe("<html>Rendered source</html>");
    expect(saved.extractor).toEqual({ name: "trafilatura", includeLinks: true });
    expect(JSON.parse(readFileSync(result.details.manifestPath, "utf8")).request).toEqual({
      format: "text",
      bypassCache: false,
      preferFitMarkdown: true,
      bm25: { query: "documentation", threshold: 0 },
      extractor: { name: "trafilatura", includeLinks: true },
    });
  });
});
