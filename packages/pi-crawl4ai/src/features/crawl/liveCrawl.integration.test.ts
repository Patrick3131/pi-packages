/** Genuine remote-browser contract gate. Opt-in only; unavailable/unsupported services fail, never HTTPS fallback. */
jest.mock("@earendil-works/pi-coding-agent", () => {
  const path = require("node:path");
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(source, { format: "cjs" }).code)(module, module.exports);
  return { ...module.exports, defineTool: (tool: unknown) => tool };
}, { virtual: true });

import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../../config";
import { registerCrawlTool } from "./crawlTool";
import { executeCrawlRead } from "./crawlReadTool";
import type { CrawlToolParams } from "./types";

const OUTPUT = "./__test_live_crawl_output__";
const live = process.env.CRAWL4AI_LIVE === "1" ? describe : describe.skip;
const nativeFetch = global.fetch;

function fixtures(): { root: string; allowed: string; excluded: string } {
  // Supply already browser-reachable fixtures (including an operator-served local fixture) without a new deployment harness.
  if (process.env.CRAWL4AI_LIVE_TARGETS_FILE) return JSON.parse(readFileSync(process.env.CRAWL4AI_LIVE_TARGETS_FILE, "utf8"));
  const page = (body: string) => `https://httpbin.org/base64/${Buffer.from(`<html><body><main>${body}</main></body></html>`).toString("base64")}`;
  const allowed = page("<h1>Allowed child marker</h1><p>Installation documentation explains browser rendering and source recovery.</p>");
  const excluded = page("<h1>Excluded child marker</h1><p>This child must be excluded from filtered traversal.</p>");
  const root = page(`<h1>Root fixture marker</h1><p id="delayed">before-marker</p><a href="${allowed}">Allowed documentation</a><a href="${excluded}">Excluded documentation</a><a href="https://example.com/">External domain</a><script>setTimeout(()=>document.getElementById("delayed").textContent="after-marker",1200)</script>`);
  return { root, allowed, excluded };
}

live("live Crawl4AI service contracts (deep/filter gate may fail on untrusted deployments)", () => {
  let execute: any;
  let targets: ReturnType<typeof fixtures>;
  let observed: any[];
  beforeEach(() => {
    targets = fixtures(); observed = [];
    const config = loadConfig();
    config.raw.outputDir = OUTPUT; config.raw.retention.enabled = false;
    const registered: any[] = [];
    registerCrawlTool({ registerTool: (tool: unknown) => registered.push(tool) } as unknown as ExtensionAPI, config);
    execute = (params: Partial<CrawlToolParams>) => registered[0].execute("live", { urls: [targets.root], ...params }, undefined, undefined, { cwd: process.cwd() });
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const response = await nativeFetch(input, init);
      observed.push(await response.clone().json());
      return response;
    });
  });
  afterEach(() => { jest.restoreAllMocks(); rmSync(OUTPUT, { recursive: true, force: true }); });

  it("renders delayed JavaScript with waitFor and persists recoverable progressive reads", async () => {
    const immediate = await execute({ bypassCache: true, format: "html" });
    expect(readFileSync(immediate.details.savedFiles[0].path, "utf8")).toContain(">before-marker<");
    const delayed = await execute({ bypassCache: true, waitFor: 1800, format: "html" });
    expect(readFileSync(delayed.details.savedFiles[0].path, "utf8")).toContain(">after-marker<");
    const markdown = await execute({ bypassCache: true, waitFor: 1800 });
    expect(markdown.details.results[0].success).toBe(true);
    const saved = markdown.details.savedFiles[0];
    expect(readFileSync(saved.outlinePath, "utf8")).toContain("Root fixture marker");
    const read = executeCrawlRead({ path: saved.path, query: "fixture", maxChars: 3000 }, { outputRoot: OUTPUT });
    expect(read.details.error).toBeUndefined(); expect(read.text).toContain("Root fixture marker");
    expect(markdown.content[0].text).toContain(markdown.details.manifestPath);
    expect(JSON.parse(readFileSync(markdown.details.manifestPath, "utf8")).pages[0].file).toBe(saved.file);
  }, 120000);

  it("typed enabled cache is miss then hit; bypass remains a miss", async () => {
    const url = `${targets.allowed}?pi-cache-test=${Date.now()}-${process.pid}`;
    await execute({ urls: [url] });
    await execute({ urls: [url] });
    await execute({ urls: [url], bypassCache: true });
    expect(observed[0].results[0].cache_status).toBe("miss");
    expect(observed[1].results[0].cache_status).toBe("hit");
    expect(observed[1].results[0].cached_at).toBeTruthy();
    expect(observed[2].results[0].cache_status).toBe("miss");
  }, 120000);

  it("deep/filter runtime gate: seed-only depth, maxPages, include/exclude/domain traversal", async () => {
    // 0.9.4's untrusted API rejects strategies. This test MUST fail there rather than reinterpret rejection as traversal success.
    const seed = await execute({ bypassCache: true, deepCrawl: { maxDepth: 1, maxPages: 5 } });
    expect(seed.details.results.map((page: any) => page.url)).toEqual([targets.root]);
    const limited = await execute({ bypassCache: true, deepCrawl: { maxDepth: 2, maxPages: 2 } });
    expect(limited.details.results).toHaveLength(2);
    const filtered = await execute({ bypassCache: true, deepCrawl: {
      maxDepth: 2, maxPages: 5, includeExternal: true,
      includePatterns: [targets.allowed, targets.excluded], excludePatterns: [targets.excluded], allowedDomains: [new URL(targets.root).hostname],
    } });
    const urls = filtered.details.results.map((page: any) => page.url);
    expect(urls).toContain(targets.root); expect(urls).toContain(targets.allowed); expect(urls).not.toContain(targets.excluded);
    expect(urls.every((url: string) => new URL(url).hostname === new URL(targets.root).hostname)).toBe(true);
    expect(filtered.details.results.length).toBeLessThanOrEqual(5);
    expect(resolve(filtered.details.manifestPath)).toBe(filtered.details.manifestPath);
  }, 180000);
});
