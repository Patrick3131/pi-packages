/**
 * Tests for crawl_read progressive reader.
 */

jest.mock("@earendil-works/pi-coding-agent", () => {
  const path = require("node:path");
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(source, { format: "cjs" }).code)(module, module.exports);
  const truncate = module.exports;
  return { ...truncate, defineTool: (tool: unknown) => tool };
}, { virtual: true });

import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../../config";
import { registerCrawlReadTool, executeCrawlRead } from "./crawlReadTool";
import { saveCrawlResultsDetailed, createCrawlSession, writeCrawlArtifact, urlToFilePath } from "./saveOutput";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

Install the package from the pi-packages Git repository.

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
    const { sessionDir } = saveCrawlResultsDetailed(
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
    const pagePath = join(sessionDir, urlToFilePath("https://docs.example.com/install", "markdown"));
    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(pagePath.replace(/\.md$/, ".outline.md"))).toBe(true);
    expect(existsSync(pagePath.replace(/\.md$/, ".meta.json"))).toBe(true);
    return { sessionDir, pagePath };
  }

  it("chooses newest completed URL session and reports timestamp, never falls back from explicit context", () => {
    const { sessionDir: older } = seedSession();
    const olderManifest = join(older, "crawl-manifest.json");
    const oldData = JSON.parse(require("node:fs").readFileSync(olderManifest, "utf8"));
    writeFileSync(olderManifest, JSON.stringify({ ...oldData, timestamp: "2020-01-01T00:00:00Z" }));
    const { sessionDir: newest, pagePath } = seedSession();
    const result = executeCrawlRead({ url: "https://docs.example.com/install", mode: "full" }, { outputRoot: TEST_DIR });
    expect(result.details.path).toBe(pagePath); expect(result.text).toContain("Saved at:"); expect(result.details.savedAt).toBeDefined();
    const missing = executeCrawlRead({ path: join(TEST_DIR, "missing-context"), url: "https://docs.example.com/install" }, { outputRoot: TEST_DIR });
    expect(missing.details.error).toMatch(/Explicit crawl context/);
    const wrong = executeCrawlRead({ path: newest, url: "https://not-saved.example/" }, { outputRoot: TEST_DIR });
    expect(wrong.details.error).toMatch(/URL not found/);
  });

  it("does not silently read an older source when the newest matching manifest has a missing page", () => {
    const { sessionDir: old } = seedSession();
    const manifestPath = join(old, "crawl-manifest.json");
    const manifest = JSON.parse(require("node:fs").readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, timestamp: "2020-01-01T00:00:00Z" }));
    const { pagePath } = seedSession(); rmSync(pagePath);
    const result = executeCrawlRead({ url: "https://docs.example.com/install" }, { outputRoot: TEST_DIR });
    expect(result.details.error).toMatch(/missing/);
  });

  it("resolves a modern nested custom session relative to supplied cwd", () => {
    const dir = resolve(TEST_DIR, "custom", "session"); mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(join(dir, "nested", "page.md"), PAGE);
    writeFileSync(join(dir, "crawl-manifest.json"), JSON.stringify({ timestamp: new Date().toISOString(), pages: [{ url: "https://custom.example/", file: "nested/page.md", success: true }], files: ["nested/page.md"], urls: ["https://custom.example/"] }));
    const result = executeCrawlRead({ path: "session", url: "https://custom.example/", mode: "full" }, { outputRoot: "other", cwd: resolve(TEST_DIR, "custom") });
    expect(result.text).toContain("Installation"); expect(result.details.path).toBe(join(dir, "nested", "page.md"));
  });

  it("rejects files-only manifests instead of inferring page records", () => {
    const dir = resolve(TEST_DIR, "files-only"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "page.md"), PAGE);
    const manifestPath = join(dir, "crawl-manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ timestamp: new Date().toISOString(), files: ["page.md"], urls: ["https://example.com/"] }));
    for (const params of [{ path: manifestPath }, { path: dir, url: "https://example.com/" }, { url: "https://example.com/" }]) {
      const result = executeCrawlRead(params, { outputRoot: TEST_DIR });
      expect(result.details.error).toMatch(/Invalid crawl manifest/);
      expect(result.text).not.toContain("Installation");
    }
  });

  it("does not select index.md or the first Markdown file from a directory", () => {
    const dir = resolve(TEST_DIR, "unpublished"); mkdirSync(dir, { recursive: true });
    for (const file of ["index.md", "page.md"]) writeFileSync(join(dir, file), PAGE);
    for (const path of [dir, "unpublished"]) {
      const directory = executeCrawlRead({ path, mode: "full" }, { outputRoot: TEST_DIR });
      expect(directory.details.error).toMatch(/no crawl-manifest/);
    }
    const exact = executeCrawlRead({ path: join(dir, "page.md"), mode: "full" }, { outputRoot: TEST_DIR });
    expect(exact.details.error).toBeUndefined(); expect(exact.text).toContain("Installation");
    expect(exact.details.savedAt).toBeUndefined();
  });

  it("rejects manifest traversal and symlink escapes for URL and direct reads", () => {
    const { sessionDir, pagePath } = seedSession();
    const outside = resolve(TEST_DIR, "outside.md"); writeFileSync(outside, "outside secret");
    symlinkSync(outside, join(sessionDir, "escape.md"));
    const manifestPath = join(sessionDir, "crawl-manifest.json");
    for (const file of ["../outside.md", "escape.md"]) {
      writeFileSync(manifestPath, JSON.stringify({ timestamp: new Date().toISOString(), pages: [{ url: "https://escape.example/", file, success: true }], files: [file], urls: ["https://escape.example/"] }));
      const result = executeCrawlRead({ path: sessionDir, url: "https://escape.example/" }, { outputRoot: TEST_DIR });
      expect(result.details.error).toMatch(/escapes/); expect(result.text).not.toContain("outside secret");
    }
    const direct = executeCrawlRead({ path: join(sessionDir, "escape.md"), mode: "full" }, { outputRoot: TEST_DIR });
    expect(direct.details.error).toMatch(/escapes/);
    expect(existsSync(pagePath)).toBe(true);
  });

  it("caps all read modes by characters, bytes and lines; zero is empty and oversized overrides retain a pointer", () => {
    const { pagePath } = seedSession();
    writeFileSync(pagePath, "# Documentation\n" + "文\n".repeat(50000));
    for (const mode of ["outline", "chunks", "window", "full"] as const) {
      const capped = executeCrawlRead({ path: pagePath, mode, query: "documentation", maxChars: 1000000, limit: 50000 }, { outputRoot: TEST_DIR });
      expect(Buffer.byteLength(capped.text)).toBeLessThanOrEqual(50 * 1024); expect(capped.text.split("\n").length).toBeLessThanOrEqual(2000);
      const zero = executeCrawlRead({ path: pagePath, mode, maxChars: 0 }, { outputRoot: TEST_DIR }); expect(zero.text).toBe("");
    }
    const full = executeCrawlRead({ path: pagePath, mode: "full" }, { outputRoot: TEST_DIR });
    expect(full.text.length).toBeLessThanOrEqual(6000); expect(full.text).toContain(pagePath);
  });

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

  it("generates a default outline for saved Trafilatura text without treating the article as a sidecar", () => {
    const url = "https://docs.example.com/text";
    const text = "Native extracted article.\n\n" + "Documentation provides source recovery and browser rendering instructions. ".repeat(6);
    const html = "<html><article>Original rendered source</article></html>";
    const sessionDir = createCrawlSession(TEST_DIR, [url]);
    writeCrawlArtifact(sessionDir, "original.raw.html", html);
    const saved = saveCrawlResultsDetailed(TEST_DIR, [url], [{ url, success: true, markdown: text }], "text", undefined, {
      sessionDir, artifacts: [{ rawHtmlFile: "original.raw.html", extractor: { name: "trafilatura", includeLinks: false } }],
    });
    const page = saved.pagePaths[0];
    expect(page.path).toMatch(/\.txt$/);
    expect(page.outlinePath).toBeUndefined(); expect(page.metaPath).toBeUndefined();
    const outline = executeCrawlRead({ path: page.path }, { outputRoot: TEST_DIR });
    expect(outline.details.mode).toBe("outline"); expect(outline.details.usedSidecarOutline).toBe(false);
    expect(outline.text).toContain("# Outline"); expect(outline.text).toContain("No headings found");
    expect(outline.text.length).toBeLessThan(text.length);
    const query = executeCrawlRead({ path: page.path, query: "source recovery" }, { outputRoot: TEST_DIR });
    expect(query.text).toContain("Documentation provides source recovery");
    const full = executeCrawlRead({ path: page.path, mode: "full" }, { outputRoot: TEST_DIR });
    expect(full.text).toContain(text);
    expect(readFileSync(page.path, "utf8")).toBe(text);
    expect(readFileSync(page.rawHtmlPath!, "utf8")).toBe(html);
  });

  it("keeps a relevant excerpt under a small cap when the saved source URL is very long", () => {
    const url = `https://httpbin.org/base64/${"a".repeat(4000)}`;
    const body = "# Actual article\n\nInstallation instructions provide source recovery and browser rendering. ".repeat(6);
    const saved = saveCrawlResultsDetailed(TEST_DIR, [url], [{ url, success: true, markdown: body }], "markdown");
    const path = saved.pagePaths[0].path;
    const result = executeCrawlRead({ path, mode: "chunks", query: "source recovery", maxChars: 1000 }, { outputRoot: TEST_DIR });
    expect(result.text).toContain("Installation instructions");
    expect(result.text).toContain(path);
    expect(result.text.length).toBeLessThanOrEqual(1000);
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

  it("reads the manifest first and resolves a page URL to its nested path", () => {
    const { sessionDir, pagePath } = seedSession();
    const manifestPath = join(sessionDir, "crawl-manifest.json");
    const relativeSession = executeCrawlRead({ path: sessionDir.split("/").at(-1) }, { outputRoot: TEST_DIR });
    expect(relativeSession.details.manifestPath).toBe(manifestPath);

    const manifest = executeCrawlRead(
      { path: manifestPath },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(manifest.details.manifestPath).toBe(resolve(manifestPath));
    expect(manifest.text).toContain("crawl manifest");
    expect(manifest.text).toContain(pagePath);

    const byUrl = executeCrawlRead(
      { path: manifestPath, url: "https://docs.example.com/install" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(byUrl.details.path).toBe(resolve(pagePath));
    expect(byUrl.text).toContain("Installation");

    const byUrlOnly = executeCrawlRead(
      { url: "https://docs.example.com/install" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(byUrlOnly.details.path).toBe(resolve(pagePath));
  });

  it("lists exact valid paths when a flattened path is missing", () => {
    const { pagePath } = seedSession();
    const result = executeCrawlRead(
      { path: join(TEST_DIR, "flattened-docs.example.com-install.md") },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.text).toMatch(/not found/i);
    expect(result.text).toContain(pagePath.split("/").at(-1));
    expect(result.text).toContain("crawl-manifest.json");
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

  it("marks a missing path as an actual tool error", async () => {
    const registered: any[] = [];
    const pi = {
      registerTool: (tool: any) => registered.push(tool),
    } as unknown as ExtensionAPI;
    registerCrawlReadTool(pi, loadConfig());

    await expect(
      registered[0].execute("tool-call-id", { path: "./__definitely-missing-crawl-page__.md" })
    ).rejects.toThrow(/not found/i);
  });
});
