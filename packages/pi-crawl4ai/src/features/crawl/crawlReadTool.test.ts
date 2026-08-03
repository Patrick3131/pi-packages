/**
 * Tests for crawl_read progressive reader.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../config";
import { registerCrawlReadTool, executeCrawlRead } from "./crawlReadTool";
import { saveCrawlResults } from "./saveOutput";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const TEST_DIR = "./__test_crawl_read__";

function cleanup() {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const PAGE = `# Example Docs

Intro paragraph about the product.

## Installation

Run npm install pi-crawl4ai.

## Docker

Start crawl4ai with docker compose.
Set CRAWL4AI_BASE_URL=http://localhost:11235

## Pricing

Enterprise plans available.
`;

describe("executeCrawlRead", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  function seedSession() {
    const sessionDir = saveCrawlResults(
      TEST_DIR,
      ["https://docs.example.com/install"],
      [
        {
          url: "https://docs.example.com/install",
          success: true,
          markdown: PAGE,
          metadata: { title: "Example Docs" },
        },
      ],
      "markdown"
    );
    const pagePath = join(sessionDir, "docs.example.com/install.md");
    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(join(sessionDir, "docs.example.com/install.outline.md"))).toBe(true);
    expect(existsSync(join(sessionDir, "docs.example.com/install.meta.json"))).toBe(true);
    return { sessionDir, pagePath };
  }

  it("returns outline mode by default", () => {
    const { pagePath } = seedSession();
    const result = executeCrawlRead(
      { path: pagePath },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("outline");
    expect(result.text).toContain("# Outline");
    expect(result.text).toContain("Installation");
    expect(result.text).toContain("Docker");
    expect(result.text).toContain("Headings:");
    expect(result.details.usedSidecarOutline).toBe(true);
    expect(result.details.charCount).toBe(PAGE.length);
  });

  it("returns query-ranked chunks", () => {
    const { pagePath } = seedSession();
    const result = executeCrawlRead(
      { path: pagePath, mode: "chunks", query: "CRAWL4AI_BASE_URL docker" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("chunks");
    expect(result.text).toContain("CRAWL4AI_BASE_URL");
    expect(result.text.toLowerCase()).toContain("docker");
    // Should not need to dump pricing fluff when query is docker
    expect(result.details.chunkCount).toBeGreaterThan(0);
  });

  it("defaults to chunks when query is provided without mode", () => {
    const { pagePath } = seedSession();
    const result = executeCrawlRead(
      { path: pagePath, query: "pricing" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("chunks");
    expect(result.text.toLowerCase()).toContain("pricing");
  });

  it("returns a line window", () => {
    const { pagePath } = seedSession();
    const result = executeCrawlRead(
      { path: pagePath, mode: "window", offset: 1, limit: 4 },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("window");
    expect(result.details.startLine).toBe(1);
    expect(result.details.endLine).toBe(4);
  });

  it("caps full mode", () => {
    const { pagePath } = seedSession();
    const result = executeCrawlRead(
      { path: pagePath, mode: "full", maxChars: 120 },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("full");
    expect(result.details.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(200);
  });

  it("errors on missing path", () => {
    const result = executeCrawlRead(
      { path: join(TEST_DIR, "nope.md") },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.text).toMatch(/not found/i);
  });
});

describe("registerCrawlReadTool", () => {
  it("registers crawl_read tool", () => {
    const registered: any[] = [];
    const pi = {
      registerTool: (tool: any) => registered.push(tool),
    } as unknown as ExtensionAPI;
    registerCrawlReadTool(pi, loadConfig());
    expect(registered[0].name).toBe("crawl_read");
    expect(registered[0].parameters).toBeDefined();
  });
});
