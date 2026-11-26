/**
 * Call-level sticky egress lanes: one lane per logical call, reused across the
 * package's 3-URL chunks. Stub-only; the sidecar contract is asserted, not reached.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfigWithEnv } from "../../config/loader";
import type { Crawl4AIConfig } from "../../config";
import { CrawlValidationError, executeCrawl } from "./crawlCore";
import { crawlToolDefinition } from "./crawlToolDefinition";
import { CrawlOperationError } from "./http";
import type { CrawlToolParams } from "./types";
import { mockFetch, resetEnv, restoreFetch } from "../../test-utils";

const PAGE = "https://example.com/page";
const URLS = Array.from({ length: 4 }, (_, index) => `${PAGE}-${index}`);

let cwd: string;

function config(acquisition = true, deepseekApiKey?: string): Crawl4AIConfig {
  const raw = mergeConfigWithEnv({ capabilities: { acquisition }, retention: { enabled: false }, deepseekApiKey });
  return { baseUrl: raw.baseUrl, timeout: 2000, apiToken: "fixture-token", raw };
}

function page(url: string) {
  return { url, success: true, html: `<main><h1>${url}</h1></main>`, markdown: { raw_markdown: `# ${url}\nbody` }, status_code: 200, response_headers: { "content-type": "text/html" } };
}

function requestBody(fetchMock: jest.Mock, index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index][1].body));
}

beforeEach(() => {
  resetEnv();
  cwd = mkdtempSync(join(tmpdir(), "crawl-egress-session-"));
});
afterEach(() => {
  restoreFetch();
  rmSync(cwd, { recursive: true, force: true });
});

describe("egressSession lanes", () => {
  it("starts one lane per logical call and reuses its handle across 3-URL chunks", async () => {
    const fetchMock = mockFetch([
      { data: { success: true, egress: { handle: "lane-a", fresh: true, expiresAt: "2026-11-26T10:15:00Z" }, results: URLS.slice(0, 3).map(page) } },
      { data: { success: true, egress: { handle: "lane-a", fresh: false, expiresAt: "2026-11-26T10:15:00Z" }, results: URLS.slice(3).map(page) } },
    ]);
    const result = await executeCrawl({ urls: URLS, egressSession: true }, config(), { cwd });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/acquire$/);
    expect(requestBody(fetchMock, 0)).toMatchObject({ urls: URLS.slice(0, 3), egress: { action: "start" } });
    expect(requestBody(fetchMock, 0).egress.handle).toBeUndefined();
    expect(requestBody(fetchMock, 1)).toMatchObject({ urls: URLS.slice(3), egress: { action: "keep", handle: "lane-a" } });
    expect(result.details.evidence.pages.map(value => value.url)).toEqual(URLS);
    expect(result.details.egressSession).toEqual({ handle: "lane-a", fresh: false, expiresAt: "2026-11-26T10:15:00Z" });
    expect(result.content[0].text).toContain("lane=lane-a");
  });

  it("forwards a caller handle unchanged and keeps the latest handle for later chunks", async () => {
    const fetchMock = mockFetch([
      { data: { success: true, egress: { handle: "lane-10" }, results: URLS.slice(0, 3).map(page) } },
      { data: { success: true, egress: { handle: "lane-10" }, results: URLS.slice(3).map(page) } },
    ]);
    const result = await executeCrawl({ urls: URLS, egressSession: "lane-9" }, config(), { cwd });

    expect(requestBody(fetchMock, 0).egress).toEqual({ action: "keep", handle: "lane-9" });
    expect(requestBody(fetchMock, 1).egress).toEqual({ action: "keep", handle: "lane-10" });
    expect(result.details.egressSession).toEqual({ handle: "lane-10" });
  });

  it("keeps the default rotating egress when egressSession is omitted or false", async () => {
    const omitted = mockFetch({ data: { success: true, results: URLS.slice(0, 3).map(page) } });
    await executeCrawl({ urls: URLS.slice(0, 3) }, config(), { cwd });
    expect(requestBody(omitted, 0)).not.toHaveProperty("egress");

    const disabled = mockFetch({ data: { success: true, results: [page(PAGE)] } });
    await executeCrawl({ urls: [PAGE], egressSession: false }, config(), { cwd });
    expect(requestBody(disabled, 0)).not.toHaveProperty("egress");
  });

  it("never dispatches a second chunk without a lane handle", async () => {
    const fetchMock = mockFetch({ data: { success: true, results: URLS.slice(0, 3).map(page) } });
    const result = await executeCrawl({ urls: URLS, egressSession: true }, config(), { cwd });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.details.partial).toBe(true);
    expect(result.details.acquisition).toMatchObject({ attemptedUrls: URLS.slice(0, 3), unattemptedUrls: [URLS[3]], complete: false });
    expect(result.details.egressSession).toBeUndefined();
    expect(result.content[0].text).toContain("no lane handle for the first chunk");
  });

  it("returns the first chunk and the typed lane failure when a later chunk is refused", async () => {
    const fetchMock = mockFetch([
      { data: { success: true, egress: { handle: "lane-a" }, results: URLS.slice(0, 3).map(page) } },
      { data: { success: false, results: URLS.slice(3).map(url => ({ url, success: false, error: { category: "resource_limit", code: "egress_lane_exhausted", phase: "queue", message: "Lane budget spent", retryable: false } })) } },
    ]);
    const result = await executeCrawl({ urls: URLS, egressSession: true }, config(), { cwd });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.details.partial).toBe(true);
    expect(result.details.acquisition).toMatchObject({
      complete: false,
      attemptedUrls: URLS,
      failure: { code: "resource_limit", category: "resource_limit", serverCode: "egress_lane_exhausted", retryable: false },
    });
    expect(result.details.evidence.pages.map(value => value.url)).toEqual(URLS.slice(0, 3));
    expect(result.details.egressSession).toEqual({ handle: "lane-a" });
    expect(result.content[0].text).toContain("Partial acquisition");
  });

  it.each([
    ["deepCrawl", true, { deepCrawl: { maxDepth: 2 } }, "cannot be combined with deepCrawl"],
    ["deepCrawl with a handle", "lane-9", { deepCrawl: { maxDepth: 2 } }, "cannot be combined with deepCrawl"],
    ["fallback", true, { fallback: true }, "cannot be combined with fallback=true"],
    ["fallback with a handle", "lane-9", { fallback: true }, "cannot be combined with fallback=true"],
  ])("rejects the %s combination before dispatch", async (_label, egressSession, extra, message) => {
    const fetchMock = mockFetch({});
    const params = { urls: [PAGE], egressSession, ...extra } as CrawlToolParams;
    const error = await executeCrawl(params, config(true, "fixture-deepseek-key"), { cwd }).catch(value => value);

    expect(error).toBeInstanceOf(CrawlValidationError);
    expect(error).toMatchObject({ code: "validation_error", message: expect.stringContaining(message) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([true, "lane-9"])("rejects egressSession=%p before dispatch when acquisition is disabled", async egressSession => {
    const fetchMock = mockFetch({});
    await expect(executeCrawl({ urls: [PAGE], egressSession }, config(false), { cwd })).rejects.toMatchObject({
      code: "unsupported_capability", message: expect.stringContaining("capabilities.acquisition"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["egress_unavailable", "unsupported_capability", "not enabled"],
    ["egress_unknown_handle", "validation_error", "unknown or expired"],
    ["egress_lane_cooldown", "resource_limit", "cooldown"],
    ["egress_lane_exhausted", "resource_limit", "request budget"],
  ])("maps %s to a distinct typed failure", async (code, category, hint) => {
    const fetchMock = mockFetch({ data: { success: false, results: [{ url: PAGE, success: false, error: { code, message: "service refusal", retryable: false } }] } });
    const error = await executeCrawl({ urls: [PAGE], egressSession: true }, config(), { cwd }).catch(value => value);

    expect(error).toBeInstanceOf(CrawlOperationError);
    expect(error).toMatchObject({ code: category, category, serverCode: code, retryable: false });
    expect(error.message).toContain(hint);
    expect(error.message).toContain(code);
    expect(error.message.match(/\(egress_[a-z_]+\)/g)).toEqual([`(${code})`]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps an HTTP lane refusal body instead of reporting a generic validation error", async () => {
    mockFetch({ ok: false, status: 422, text: JSON.stringify({ detail: { code: "egress_unavailable", message: "No lane ports configured" } }) });
    await expect(executeCrawl({ urls: [PAGE], egressSession: "lane-9" }, config(), { cwd })).rejects.toMatchObject({
      code: "unsupported_capability", serverCode: "egress_unavailable", status: 422,
    });
  });

  it("rejects a malformed lane receipt instead of inventing lane identity", async () => {
    mockFetch({ data: { success: true, egress: { handle: 7 }, results: [page(PAGE)] } });
    await expect(executeCrawl({ urls: [PAGE], egressSession: true }, config(), { cwd })).rejects.toMatchObject({
      code: "provider_failure", message: expect.stringContaining("Malformed acquisition egress receipt"),
    });
  });

  it.each([
    ["", "must not be blank"],
    [5, "must be true to start a lane"],
  ])("rejects an invalid field value %p before dispatch", async (egressSession, message) => {
    const fetchMock = mockFetch({});
    await expect(executeCrawl({ urls: [PAGE], egressSession } as unknown as CrawlToolParams, config(), { cwd })).rejects.toMatchObject({
      code: "validation_error", message: expect.stringContaining(message),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers the egressSession field on the tool schema", () => {
    expect(crawlToolDefinition.parameters.properties.egressSession).toBeDefined();
  });
});
