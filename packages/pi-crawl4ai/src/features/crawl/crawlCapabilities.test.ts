import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfigWithEnv } from "../../config/loader";
import type { Crawl4AIConfig } from "../../config";
import { executeCrawl } from "./crawlCore";
import { executeCrawlInteract, CrawlInteractionError } from "./crawlCapabilities";
import { mockFetch, restoreFetch, resetEnv } from "../../test-utils";

let cwd: string;
function config(): Crawl4AIConfig {
  const raw = mergeConfigWithEnv({ capabilities: { acquisition: true, interaction: true }, retention: { enabled: false } });
  return { baseUrl: raw.baseUrl, timeout: 2000, apiToken: "fixture-token", raw };
}
const url = "https://example.com/roster";
function page() {
  return { url, success: true, html: "<main><h1>Roster</h1><p>Original source</p></main>", markdown: { raw_markdown: "# Roster\nOriginal source" }, status_code: 200, response_headers: { "content-type": "text/html" }, metadata: { acquisitionId: "fixture-acquisition", snapshotId: "fixture-snapshot", sha256: "fixture-hash", observedAt: "2026-10-21T00:00:00Z", cacheStatus: "unknown", callerScriptInfluenced: false, verifiedRedirects: [] } };
}
beforeEach(() => { resetEnv(); cwd = mkdtempSync(join(tmpdir(), "crawl-capabilities-")); });
afterEach(() => { restoreFetch(); rmSync(cwd, { recursive: true, force: true }); });

it("serializes focused acquisition and keeps complete source and structured cards", async () => {
  const result = { ...page(), selected_html: "<h1>Roster</h1>", extracted_content: JSON.stringify(Array.from({ length: 9 }, (_, index) => ({ name: `Creator ${index}` }))) };
  const fetchMock = mockFetch({ data: { success: true, results: [result] } });
  const output = await executeCrawl({ urls: [url], waitForSelector: ".card", selector: "main", excludeSelector: "nav", extractionSchema: { name: "roster", baseSelector: ".card", fields: [{ name: "name", selector: "h2", type: "text" }] } }, config(), { cwd });
  expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/acquire$/);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ urls: [url], waitFor: ".card", selector: "main", excludeSelector: "nav", extractionSchema: { baseSelector: ".card" } });
  expect(output).toStrictEqual(JSON.parse(JSON.stringify(output)));
  const structured = output.details.evidence.pages[0].views.find(view => view.kind === "structured")!;
  expect(JSON.parse(readFileSync(structured.path!, "utf8"))).toHaveLength(9);
  const manifest = JSON.parse(readFileSync(output.details.manifestPath!, "utf8"));
  expect(readFileSync(join(output.details.savedPath!, manifest.pages[0].rawHtmlFile), "utf8")).toContain("Original source");
  for (const format of ["html", "text"] as const) {
    mockFetch({ data: { success: true, results: [{ ...page(), html: "<nav>Excluded navigation</nav><main>Selected content</main>", selected_html: "<main>Selected content</main>" }] } });
    const excluded = await executeCrawl({ urls: [url], excludeSelector: "nav", format }, config(), { cwd });
    expect(readFileSync(excluded.details.savedFiles![0].path, "utf8")).not.toContain("Excluded navigation");
    expect(readFileSync(excluded.details.savedFiles![0].rawHtmlPath!, "utf8")).toContain("Excluded navigation");
  }
  mockFetch({ data: { success: true, results: [{ ...page(), markdown: { raw_markdown: "" }, extraction_error: { category: "resource_limit", code: "derived_output_limit", message: "Derived content exceeded the operation byte limit" } }] } });
  const partial = await executeCrawl({ urls: [url], selector: "main" }, config(), { cwd });
  expect(partial.details.partial).toBe(true);
  expect(partial.content[0].text).toContain("derived_output_limit");
  expect(readFileSync(partial.details.savedFiles![0].rawHtmlPath!, "utf8")).toContain("Original source");
});

it("uses the interaction endpoint with arbitrary JavaScript and preserves original/script provenance", async () => {
  const before = page();
  const result = { ...before, html: "<main>Invented by script</main>", markdown: { raw_markdown: "Invented by script" }, metadata: { ...before.metadata, snapshotId: "after", callerScriptInfluenced: true }, interaction: { before: { url, html: before.html, metadata: before.metadata }, after: { html: "<main>Invented by script</main>", metadata: { ...before.metadata, snapshotId: "after", callerScriptInfluenced: true } }, actions: [], scriptHashes: [createHash("sha256").update("document.body.textContent = 'Invented by script'").digest("hex")], results: [{ forged: true }], outcome: "confirmed" } };
  const fetchMock = mockFetch({ data: { success: true, results: [result] } });
  const output = await executeCrawlInteract({ url, scripts: ["document.body.textContent = 'Invented by script'"] }, config(), { cwd });
  expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/execute_js$/);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ scripts: ["document.body.textContent = 'Invented by script'"] });
  expect(JSON.stringify(output.details)).toContain('"callerScriptInfluenced":true');
  const beforeView = output.details.evidence.pages[0].views.find(view => view.kind === "before_interaction_html")!;
  expect(beforeView.callerScriptInfluenced).toBe(false);
  expect(beforeView.url).toBe(url);
  expect(readFileSync(beforeView.path!, "utf8")).toBe(before.html);
  const operation = output.details.evidence.pages[0].views.find(view => view.kind === "interaction_result")!;
  expect(JSON.parse(readFileSync(operation.path!, "utf8")).scriptHashes).toEqual([createHash("sha256").update("document.body.textContent = 'Invented by script'").digest("hex")]);
  expect(output.details.evidence.pages[0].views.filter(view => view.kind !== "before_interaction_html").every(view => view.callerScriptInfluenced)).toBe(true);
});

it("does not retry or report a transport-lost interaction as confirmed", async () => {
  const fetchMock = jest.fn().mockRejectedValue(new Error("connection lost"));
  global.fetch = fetchMock;
  await expect(executeCrawlInteract({ url, actions: [{ type: "click", selector: "button" }] }, config(), { cwd })).rejects.toMatchObject({ code: "interaction_unconfirmed", retryable: false, operationOutcome: "unconfirmed" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(CrawlInteractionError).toBeDefined();
  for (const results of [[], [null], [{ ...page(), url: "https://example.com/wrong", interaction: { outcome: "confirmed" } }], [{ ...page(), html: 5, interaction: { outcome: "confirmed" } }]]) {
    mockFetch({ data: { success: true, results } });
    await expect(executeCrawlInteract({ url, actions: [{ type: "click", selector: "button" }] }, config(), { cwd })).rejects.toMatchObject({ code: "interaction_unconfirmed", retryable: false, operationOutcome: "unconfirmed" });
  }
});

it("round-trips bounded original PDF bytes and page provenance, rejecting a mismatched hash", async () => {
  const { createHash } = await import("node:crypto");
  const bytes = Buffer.from("%PDF-1.4\nSynthetic server-parsed PDF fixture");
  const document = { originalBase64: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex"), pages: [{ pageNumber: 1, text: "Document page text" }], metadata: { title: "Fixture document" }, limitations: [] };
  const response = { ...page(), html: "", markdown: { raw_markdown: "Document page text" }, response_headers: { "content-type": "application/pdf" }, document };
  mockFetch({ data: { success: true, results: [response] } });
  const output = await executeCrawl({ urls: [url], format: "text" }, config(), { cwd });
  const views = output.details.evidence.pages[0].views;
  expect(readFileSync(views.find(view => view.kind === "original_document")!.path!)).toEqual(bytes);
  expect(JSON.parse(readFileSync(views.find(view => view.kind === "document_pages")!.path!, "utf8")).pages).toEqual(document.pages);
  mockFetch({ data: { success: true, results: [{ ...response, document: { ...document, sha256: "wrong" } }] } });
  await expect(executeCrawl({ urls: [url] }, config(), { cwd })).rejects.toThrow("Invalid or oversized original PDF artifact");
});

it("checkpoints complete chunks before dispatch and keeps the absolute remaining service budget", async () => {
  const urls = Array.from({ length: 7 }, (_, index) => `${url}/${index}`);
  const startedAt = Date.now();
  let now = startedAt;
  const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
  const committed: string[] = [];
  const timeouts: number[] = [];
  global.fetch = jest.fn(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    timeouts.push(body.timeoutMs);
    if (timeouts.length === 2) {
      expect(committed).toEqual(urls.slice(0, 3));
      return { ok: true, text: async () => JSON.stringify({ success: false, results: body.urls.map((target: string) => ({ url: target, success: false, error: { category: "timeout", code: "deadline_exceeded", message: "Service deadline exceeded", phase: "navigation", retryable: false } })) }) } as Response;
    }
    return { ok: true, text: async () => JSON.stringify({ success: true, results: body.urls.map((target: string) => ({ ...page(), url: target })) }) } as Response;
  });
  try {
    const result = await executeCrawl({ urls }, config(), { cwd, acquisitionTimeoutMs: 1500, onCheckpoint: async (chunk, signal) => {
      expect(signal.aborted).toBe(false);
      const manifest = JSON.parse(readFileSync(chunk.details.manifestPath!, "utf8"));
      expect(manifest.pages).toHaveLength(3);
      committed.push(...chunk.details.evidence.pages.map(value => value.url));
      now += 400;
    } });
    expect(timeouts).toEqual([1500, 1100]);
    expect(result.details.evidence.pages.map(value => value.url)).toEqual(urls.slice(0, 3));
    expect(result.details.acquisition).toMatchObject({ complete: false, unattemptedUrls: urls.slice(6), failure: { code: "timeout", serverCode: "deadline_exceeded", category: "timeout", phase: "navigation", retryable: false } });
    expect(result.details.partial).toBe(true);
    expect(readFileSync(result.details.savedFiles[0].rawHtmlPath!, "utf8")).toContain("Original source");
  } finally { clock.mockRestore(); }
});

it("honors cancellation at a committed checkpoint without another dispatch or checkpoint", async () => {
  const urls = Array.from({ length: 6 }, (_, index) => `${url}/${index}`);
  const fetchMock = mockFetch({ data: { success: true, results: urls.slice(0, 3).map(target => ({ ...page(), url: target })) } });
  const controller = new AbortController();
  let savedPath = "";
  const checkpoint = jest.fn(chunk => { savedPath = chunk.details.savedFiles[0].rawHtmlPath; controller.abort(); });
  await expect(executeCrawl({ urls }, config(), { cwd, signal: controller.signal, onCheckpoint: checkpoint })).rejects.toThrow(/cancelled/i);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(checkpoint).toHaveBeenCalledTimes(1);
  expect(readFileSync(savedPath, "utf8")).toContain("Original source");
});

it("translates target failure vocabulary and preserves uncertain action diagnostics without replay", async () => {
  for (const [category, canonical] of [["transport", "transport_failure"], ["website_block", "website_blocked"], ["timeout", "timeout"]]) {
    const fetchMock = mockFetch({ data: { success: false, results: [{ url, success: false, error: { category, code: "safe_service_code", phase: "probe", message: "Safe diagnostic", retryable: true } }] } });
    await expect(executeCrawl({ urls: [url] }, config(), { cwd })).rejects.toMatchObject({ code: canonical, category: canonical, phase: "probe", serverCode: "safe_service_code", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
  const fetchMock = mockFetch({ data: { success: false, results: [{ url, success: false, error: { category: "timeout", code: "deadline_exceeded", phase: "action", message: "Effects uncertain", retryable: true, operationOutcome: "unconfirmed" } }] } });
  await expect(executeCrawlInteract({ url, actions: [{ type: "click", selector: "button" }] }, config(), { cwd })).rejects.toMatchObject({ code: "interaction_unconfirmed", category: "timeout", serverCode: "deadline_exceeded", phase: "action", operationOutcome: "unconfirmed", retryable: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps mixed operator results partial and bounds/redacts safe diagnostics", async () => {
  mockFetch({ data: { success: false, results: [page(), { url: `${url}/failed`, success: false, error: { category: "timeout", code: "deadline_exceeded", phase: "invented_phase", retryable: false, message: "Safe message fixture-token" } }] } });
  const result = await executeCrawl({ urls: [url, `${url}/failed`] }, config(), { cwd });
  expect(result.details.partial).toBe(true);
  expect(result.details.evidence.pages[0].usability).toBe("usable");
  expect(result.details.results[1].error).toMatchObject({ category: "timeout", code: "deadline_exceeded", message: "Safe message [redacted]" });
  expect(result.details.results[1].error).not.toHaveProperty("phase");
  expect(JSON.stringify(result)).not.toContain("fixture-token");
});
