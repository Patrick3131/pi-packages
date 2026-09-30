/**
 * Tests for crawl session selector resolution and drill-down formatting.
 */

jest.mock("@earendil-works/pi-coding-agent", () => {
  const path = require("node:path");
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(source, { format: "cjs" }).code)(module, module.exports);
  const truncate = module.exports;
  return { ...truncate, defineTool: (tool: unknown) => tool };
}, { virtual: true });

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { listCrawlSessions } from "./cleanup";
import { formatCrawlSessionDrillDown, resolveCrawlSession, SESSION_PAGE_LIMIT } from "./sessions";

const TEST_ROOT = "./__test_crawl_sessions__";

function cleanup() {
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function writeSession(
  name: string,
  options: { timestamp: string; pageCount?: number; request?: Record<string, unknown> }
) {
  const dir = join(TEST_ROOT, name);
  mkdirSync(dir, { recursive: true });
  const pages = Array.from({ length: options.pageCount ?? 1 }, (_, index) => ({
    url: `https://example.com/page-${index}`,
    file: `page-${index}.md`,
    success: true,
  }));
  for (const page of pages) writeFileSync(join(dir, page.file), "body", "utf-8");
  writeFileSync(
    join(dir, "crawl-manifest.json"),
    JSON.stringify({
      timestamp: options.timestamp,
      totalPages: pages.length,
      format: "markdown",
      urls: ["https://example.com"],
      files: pages.map((page) => page.file),
      pages,
      ...(options.request ? { request: options.request } : {}),
      service: { baseUrl: "http://localhost:11235" },
    }),
    "utf-8"
  );
  return dir;
}

describe("crawl session drill-down", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("numbers pages, caps with a remainder, keeps exact paths and rejects ambiguous selectors", () => {
    writeSession("alpha-site-100", { timestamp: "2025-09-01T12:00:00.000Z" });
    writeSession("alpha-site-200", { timestamp: "2025-09-02T12:00:00.000Z" });
    const deepDir = writeSession("beta-site-300", {
      timestamp: "2025-09-03T12:00:00.000Z",
      pageCount: 25,
      request: {
        format: "markdown",
        bypassCache: true,
        preferFitMarkdown: false,
        waitFor: 250,
        jsCode: true,
        deepCrawl: { strategy: "bfs", maxDepth: 2, maxPages: 10, allowedDomains: ["example.com"] },
        bm25: { query: "docs", threshold: 1 },
        extractor: { name: "trafilatura", includeLinks: false },
      },
    });
    const sessions = listCrawlSessions(TEST_ROOT);
    expect(sessions.map((session) => session.name)).toEqual(["beta-site-300", "alpha-site-200", "alpha-site-100"]);

    const selected = resolveCrawlSession("beta", sessions, TEST_ROOT);
    expect(selected.session?.name).toBe("beta-site-300");
    const text = formatCrawlSessionDrillDown(selected.session!, process.cwd());

    const numbered = text.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(numbered).toHaveLength(SESSION_PAGE_LIMIT);
    expect(text).toContain(`1. https://example.com/page-0 → ${resolve(deepDir, "page-0.md")}`);
    expect(numbered[SESSION_PAGE_LIMIT - 1]).toContain(`20. https://example.com/page-19 → ${resolve(deepDir, "page-19.md")}`);
    expect(text).toContain("- … and 5 more");
    expect(text).not.toContain("page-20.md");
    expect(text).toContain(join(deepDir, "crawl-manifest.json"));
    expect(text).toContain("Request: format=markdown, bypassCache=true, preferFitMarkdown=false, waitFor=250ms, jsCode=true");
    expect(text).toContain('Details: deepCrawl strategy=bfs maxDepth=2 maxPages=10 (allowedDomains=["example.com"]); bm25 query="docs" threshold=1; extractor=trafilatura includeLinks=false; service=http://localhost:11235');

    // 1-based numbers address the same newest-first listing.
    expect(resolveCrawlSession("1", sessions, TEST_ROOT).session?.name).toBe("beta-site-300");
    expect(resolveCrawlSession("3", sessions, TEST_ROOT).session?.name).toBe("alpha-site-100");

    const ambiguous = resolveCrawlSession("alpha", sessions, TEST_ROOT);
    expect(ambiguous.session).toBeUndefined();
    expect(ambiguous.error).toContain("alpha-site-100");
    expect(ambiguous.error).toContain("alpha-site-200");
    expect(ambiguous.error).not.toContain("→");

    const missing = resolveCrawlSession("does-not-exist", sessions, TEST_ROOT);
    expect(missing.session).toBeUndefined();
    expect(missing.error).toContain("does-not-exist");
    expect(missing.error).toContain(TEST_ROOT);
    expect(missing.error).toContain("3 session(s)");
    expect(missing.error).not.toContain("→");

    expect(resolveCrawlSession("9", sessions, TEST_ROOT).error).toContain("No crawl session #9");
  });
});
