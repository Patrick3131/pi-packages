/**
 * Live page crawl + progressive read integration tests.
 *
 * Strategy:
 * 1) If crawl4ai is healthy on CRAWL4AI_BASE_URL (default localhost:11235),
 *    crawl real URLs through the crawl tool.
 * 2) Otherwise, fetch public pages over HTTPS, convert to markdown-ish text,
 *    save via saveCrawlResults, and exercise crawl_read.
 *
 * Set CRAWL4AI_LIVE=1 to fail when crawl4ai is unavailable instead of falling back.
 */

import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../config";
import { registerCrawlTool } from "./crawlTool";
import { executeCrawlRead } from "./crawlReadTool";
import { saveCrawlResults } from "./saveOutput";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { CrawlResult } from "./types";

const LIVE_OUTPUT = "./__test_live_crawl_output__";
const BASE_URL = process.env.CRAWL4AI_BASE_URL || "http://localhost:11235";
const REQUIRE_CRAWL4AI = process.env.CRAWL4AI_LIVE === "1";

const TARGETS = [
  "https://example.com/",
  "https://www.rust-lang.org/",
];

function cleanup() {
  try {
    rmSync(LIVE_OUTPUT, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function crawl4aiHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Very small HTML → markdown-ish conversion for fallback live tests. */
function htmlToMarkdown(html: string, url: string): string {
  let text = html;
  // drop scripts/styles
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  // headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  // paragraphs and breaks
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  // links keep text
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  // strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!/^#\s/m.test(text)) {
    text = `# Page\n\nSource: ${url}\n\n${text}`;
  }
  return text.slice(0, 50_000);
}

async function fetchAsCrawlResult(url: string): Promise<CrawlResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "pi-crawl4ai-integration-test/1.0" },
  });
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim();
  const markdown = htmlToMarkdown(html, url);
  return {
    url,
    success: response.ok,
    markdown: {
      raw_markdown: markdown,
      markdown_with_citations: markdown,
      references_markdown: "",
      fit_markdown: markdown,
    },
    status_code: response.status,
    metadata: { title },
  };
}

function createMockPi() {
  const registeredTools: any[] = [];
  return {
    registeredTools,
    registerTool: jest.fn((tool) => {
      registeredTools.push(tool);
    }),
  } as unknown as ExtensionAPI & { registeredTools: any[] };
}

describe("live crawl + crawl_read integration", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("crawls real pages, saves outlines, and reads progressively", async () => {
    const healthy = await crawl4aiHealthy();
    if (REQUIRE_CRAWL4AI && !healthy) {
      throw new Error(
        `CRAWL4AI_LIVE=1 but crawl4ai is not healthy at ${BASE_URL}/health`
      );
    }

    let sessionDir: string;
    let pageFiles: string[] = [];

    if (healthy) {
      // Live crawl4ai path
      process.env.CRAWL4AI_BASE_URL = BASE_URL;
      process.env.CRAWL4AI_OUTPUT_DIR = LIVE_OUTPUT;
      process.env.CRAWL4AI_RETENTION_ENABLED = "false";

      const mockPi = createMockPi();
      const config = loadConfig();
      // force output dir / retention for this process
      (config.raw as any).outputDir = LIVE_OUTPUT;
      (config.raw as any).retention = {
        enabled: false,
        maxSessions: 20,
        maxAgeDays: 7,
        maxTotalMb: 512,
      };
      config.baseUrl = BASE_URL;

      registerCrawlTool(mockPi, config);
      const tool = mockPi.registeredTools.find((t) => t.name === "crawl");
      expect(tool).toBeDefined();

      const result = await tool.execute(
        "live-1",
        {
          urls: TARGETS,
          format: "markdown",
          save: LIVE_OUTPUT,
          returnMode: "files",
          preferFitMarkdown: true,
        },
        undefined,
        undefined,
        {}
      );

      expect(result.details.savedPath).toBeDefined();
      sessionDir = result.details.savedPath;
      expect(existsSync(sessionDir)).toBe(true);

      // Tool result should be compact index, not full multi-page dump
      expect(result.content[0].text).toMatch(/Return mode: files|Page index|Crawl Results/i);
      expect(result.content[0].text.length).toBeLessThan(20_000);

      // eslint-disable-next-line no-console
      console.log(
        `[live-crawl] crawl4ai mode: saved=${sessionDir} toolChars=${result.content[0].text.length} pages=${result.details.results?.length}`
      );
    } else {
      // Fallback: real HTTPS fetch + save pipeline (no browser render)
      // eslint-disable-next-line no-console
      console.log(
        `[live-crawl] crawl4ai not available at ${BASE_URL}; falling back to HTTPS fetch pipeline`
      );

      const results: CrawlResult[] = [];
      for (const url of TARGETS) {
        results.push(await fetchAsCrawlResult(url));
      }
      expect(results.every((r) => r.success)).toBe(true);

      sessionDir = saveCrawlResults(
        LIVE_OUTPUT,
        TARGETS,
        results,
        "markdown"
      );
    }

    // Discover saved markdown pages (exclude outlines)
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, name.name);
        if (name.isDirectory()) out.push(...walk(full));
        else if (name.isFile() && name.name.endsWith(".md") && !name.name.endsWith(".outline.md")) {
          out.push(full);
        }
      }
      return out;
    };

    pageFiles = walk(sessionDir);
    expect(pageFiles.length).toBeGreaterThan(0);

    for (const pagePath of pageFiles) {
      const outlinePath = pagePath.replace(/\.md$/i, ".outline.md");
      const metaPath = pagePath.replace(/\.md$/i, ".meta.json");
      expect(existsSync(outlinePath)).toBe(true);
      expect(existsSync(metaPath)).toBe(true);

      const fullText = readFileSync(pagePath, "utf-8");
      expect(fullText.length).toBeGreaterThan(20);

      const outline = executeCrawlRead(
        { path: pagePath, mode: "outline", maxChars: 4000 },
        { outputRoot: LIVE_OUTPUT, cwd: process.cwd() }
      );
      expect(outline.details.mode).toBe("outline");
      expect(outline.text.length).toBeGreaterThan(0);
      expect(outline.text.length).toBeLessThan(Math.max(fullText.length, 1000));

      const chunks = executeCrawlRead(
        {
          path: pagePath,
          mode: "chunks",
          query: "example documentation rust language install",
          maxChars: 3500,
        },
        { outputRoot: LIVE_OUTPUT, cwd: process.cwd() }
      );
      expect(chunks.details.mode).toBe("chunks");
      expect(chunks.text.length).toBeLessThanOrEqual(5000);

      // eslint-disable-next-line no-console
      console.log(
        `[live-crawl] page=${pagePath} full=${fullText.length} outline=${outline.text.length} chunks=${chunks.text.length}`
      );

      // Progressive read should be materially smaller than full page when page is large
      if (fullText.length > 2000) {
        expect(outline.text.length).toBeLessThan(fullText.length * 0.8);
      }
    }

    const manifest = JSON.parse(
      readFileSync(join(sessionDir, "crawl-manifest.json"), "utf-8")
    );
    expect(manifest.pages?.length).toBeGreaterThan(0);
    expect(manifest.pages[0].outlineFile).toBeDefined();
    expect(manifest.pages[0].metaFile).toBeDefined();
  }, 60_000);
});
