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
