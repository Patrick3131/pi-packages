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

import { Value } from "typebox/value";
import { ReadEvidenceSchema } from "./evidence";
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, readFileSync, renameSync } from "node:fs";
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

  it("chooses newest completed URL session and reports timestamp, never falls back from explicit context", async () => {
    const { sessionDir: older } = seedSession();
    const olderManifest = join(older, "crawl-manifest.json");
    const oldData = JSON.parse(require("node:fs").readFileSync(olderManifest, "utf8"));
    writeFileSync(olderManifest, JSON.stringify({ ...oldData, timestamp: "2020-01-01T00:00:00Z" }));
    const { sessionDir: newest, pagePath } = seedSession();
    const result = await executeCrawlRead({ url: "https://docs.example.com/install", mode: "full" }, { outputRoot: TEST_DIR });
    expect(result.details.path).toBe(pagePath); expect(result.text).toContain("Saved at:"); expect(result.details.savedAt).toBeDefined();
    const missing = await executeCrawlRead({ path: join(TEST_DIR, "missing-context"), url: "https://docs.example.com/install" }, { outputRoot: TEST_DIR });
    expect(missing.details.error).toMatch(/Explicit crawl context/);
    const wrong = await executeCrawlRead({ path: newest, url: "https://not-saved.example/" }, { outputRoot: TEST_DIR });
    expect(wrong.details.error).toMatch(/URL not found/);
  });

  it("does not silently read an older source when the newest matching manifest has a missing page", async () => {
    const { sessionDir: old } = seedSession();
    const manifestPath = join(old, "crawl-manifest.json");
    const manifest = JSON.parse(require("node:fs").readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, timestamp: "2020-01-01T00:00:00Z" }));
    const { pagePath } = seedSession(); rmSync(pagePath);
    const result = await executeCrawlRead({ url: "https://docs.example.com/install" }, { outputRoot: TEST_DIR });
    expect(result.details.error).toMatch(/missing/);
  });

  it("resolves a modern nested custom session relative to supplied cwd", async () => {
    const dir = resolve(TEST_DIR, "custom", "session"); mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(join(dir, "nested", "page.md"), PAGE);
    writeFileSync(join(dir, "crawl-manifest.json"), JSON.stringify({ timestamp: new Date().toISOString(), pages: [{ url: "https://custom.example/", file: "nested/page.md", success: true }], files: ["nested/page.md"], urls: ["https://custom.example/"] }));
    const result = await executeCrawlRead({ path: "session", url: "https://custom.example/", mode: "full" }, { outputRoot: "other", cwd: resolve(TEST_DIR, "custom") });
    expect(result.text).toContain("Installation"); expect(result.details.path).toBe(join(dir, "nested", "page.md"));
  });

  it("rejects files-only manifests instead of inferring page records", async () => {
    const dir = resolve(TEST_DIR, "files-only"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "page.md"), PAGE);
    const manifestPath = join(dir, "crawl-manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ timestamp: new Date().toISOString(), files: ["page.md"], urls: ["https://example.com/"] }));
    for (const params of [{ path: manifestPath }, { path: dir, url: "https://example.com/" }, { url: "https://example.com/" }]) {
      const result = await executeCrawlRead(params, { outputRoot: TEST_DIR });
      expect(result.details.error).toMatch(/Invalid crawl manifest/);
      expect(result.text).not.toContain("Installation");
    }
  });

  it("does not select index.md or the first Markdown file from a directory", async () => {
    const dir = resolve(TEST_DIR, "unpublished"); mkdirSync(dir, { recursive: true });
    for (const file of ["index.md", "page.md"]) writeFileSync(join(dir, file), PAGE);
    for (const path of [dir, "unpublished"]) {
      const directory = await executeCrawlRead({ path, mode: "full" }, { outputRoot: TEST_DIR });
      expect(directory.details.error).toMatch(/no crawl-manifest/);
    }
    const exact = await executeCrawlRead({ path: join(dir, "page.md"), mode: "full" }, { outputRoot: TEST_DIR });
    expect(exact.details.error).toBeUndefined(); expect(exact.text).toContain("Installation");
    expect(exact.details.savedAt).toBeUndefined();
  });

  it("rejects manifest traversal and symlink escapes for URL and direct reads", async () => {
    const { sessionDir, pagePath } = seedSession();
    const outside = resolve(TEST_DIR, "outside.md"); writeFileSync(outside, "outside secret");
    symlinkSync(outside, join(sessionDir, "escape.md"));
    const manifestPath = join(sessionDir, "crawl-manifest.json");
    for (const file of ["../outside.md", "escape.md"]) {
      writeFileSync(manifestPath, JSON.stringify({ timestamp: new Date().toISOString(), pages: [{ url: "https://escape.example/", file, success: true }], files: [file], urls: ["https://escape.example/"] }));
      const result = await executeCrawlRead({ path: sessionDir, url: "https://escape.example/" }, { outputRoot: TEST_DIR });
      expect(result.details.error).toMatch(/escapes/); expect(result.text).not.toContain("outside secret");
    }
    const direct = await executeCrawlRead({ path: join(sessionDir, "escape.md"), mode: "full" }, { outputRoot: TEST_DIR });
    expect(direct.details.error).toMatch(/escapes/);
    expect(existsSync(pagePath)).toBe(true);
  });

  it("caps all read modes by characters, bytes and lines; zero is empty and oversized overrides retain a pointer", async () => {
    const { pagePath } = seedSession();
    writeFileSync(pagePath, "# Documentation\n" + "文\n".repeat(50000));
    for (const mode of ["outline", "chunks", "window", "full"] as const) {
      const capped = await executeCrawlRead({ path: pagePath, mode, query: "documentation", maxChars: 1000000, limit: 50000 }, { outputRoot: TEST_DIR });
      expect(Buffer.byteLength(capped.text)).toBeLessThanOrEqual(50 * 1024); expect(capped.text.split("\n").length).toBeLessThanOrEqual(2000);
      const zero = await executeCrawlRead({ path: pagePath, mode, maxChars: 0 }, { outputRoot: TEST_DIR }); expect(zero.text).toBe("");
    }
    const full = await executeCrawlRead({ path: pagePath, mode: "full" }, { outputRoot: TEST_DIR });
    expect(full.text.length).toBeLessThanOrEqual(6000); expect(full.text).toContain(pagePath);
  });

  it("returns outline mode by default", async () => {
    const { pagePath } = seedSession();
    const result = await executeCrawlRead(
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

  it("generates a default outline for saved Trafilatura text without treating the article as a sidecar", async () => {
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
    const outline = await executeCrawlRead({ path: page.path }, { outputRoot: TEST_DIR });
    expect(outline.details.mode).toBe("outline"); expect(outline.details.usedSidecarOutline).toBe(false);
    expect(outline.text).toContain("# Outline"); expect(outline.text).toContain("No headings found");
    expect(outline.text.length).toBeLessThan(text.length);
    const query = await executeCrawlRead({ path: page.path, query: "source recovery" }, { outputRoot: TEST_DIR });
    expect(query.text).toContain("Documentation provides source recovery");
    const full = await executeCrawlRead({ path: page.path, mode: "full" }, { outputRoot: TEST_DIR });
    expect(full.text).toContain(text);
    expect(readFileSync(page.path, "utf8")).toBe(text);
    expect(readFileSync(page.rawHtmlPath!, "utf8")).toBe(html);
  });

  it("keeps a relevant excerpt under a small cap when the saved source URL is very long", async () => {
    const url = `https://httpbin.org/base64/${"a".repeat(4000)}`;
    const body = "# Actual article\n\nInstallation instructions provide source recovery and browser rendering. ".repeat(6);
    const saved = saveCrawlResultsDetailed(TEST_DIR, [url], [{ url, success: true, markdown: body }], "markdown");
    const path = saved.pagePaths[0].path;
    const result = await executeCrawlRead({ path, mode: "chunks", query: "source recovery", maxChars: 1000 }, { outputRoot: TEST_DIR });
    expect(result.text).toContain("Installation instructions");
    expect(result.text).toContain(path);
    expect(result.text.length).toBeLessThanOrEqual(1000);
  });

  it("returns query-ranked chunks", async () => {
    const { pagePath } = seedSession();
    const result = await executeCrawlRead(
      { path: pagePath, mode: "chunks", query: "CRAWL4AI_BASE_URL docker" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("chunks");
    expect(result.text).toContain("CRAWL4AI_BASE_URL");
    expect(result.text.toLowerCase()).toContain("docker");
    // Should not need to dump pricing fluff when query is docker
    expect(result.details.chunkCount).toBeGreaterThan(0);
  });

  it("defaults to chunks when query is provided without mode", async () => {
    const { pagePath } = seedSession();
    const result = await executeCrawlRead(
      { path: pagePath, query: "pricing" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("chunks");
    expect(result.text.toLowerCase()).toContain("pricing");
  });

  it("returns a line window", async () => {
    const { pagePath } = seedSession();
    const result = await executeCrawlRead(
      { path: pagePath, mode: "window", offset: 1, limit: 4 },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("window");
    expect(result.details.startLine).toBe(1);
    expect(result.details.endLine).toBe(4);
  });

  it("caps full mode", async () => {
    const { pagePath } = seedSession();
    const result = await executeCrawlRead(
      { path: pagePath, mode: "full", maxChars: 120 },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.details.mode).toBe("full");
    expect(result.details.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(200);
  });

  it("reads the manifest first and resolves a page URL to its nested path", async () => {
    const { sessionDir, pagePath } = seedSession();
    const manifestPath = join(sessionDir, "crawl-manifest.json");
    const relativeSession = await executeCrawlRead({ path: sessionDir.split("/").at(-1) }, { outputRoot: TEST_DIR });
    expect(relativeSession.details.manifestPath).toBe(manifestPath);

    const manifest = await executeCrawlRead(
      { path: manifestPath },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(manifest.details.manifestPath).toBe(resolve(manifestPath));
    expect(manifest.text).toContain("crawl manifest");
    expect(manifest.text).toContain(pagePath);

    const byUrl = await executeCrawlRead(
      { path: manifestPath, url: "https://docs.example.com/install" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(byUrl.details.path).toBe(resolve(pagePath));
    expect(byUrl.text).toContain("Installation");

    const byUrlOnly = await executeCrawlRead(
      { url: "https://docs.example.com/install" },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(byUrlOnly.details.path).toBe(resolve(pagePath));
  });

  it("lists exact valid paths when a flattened path is missing", async () => {
    const { pagePath } = seedSession();
    const result = await executeCrawlRead(
      { path: join(TEST_DIR, "flattened-docs.example.com-install.md") },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.text).toMatch(/not found/i);
    expect(result.text).toContain(pagePath.split("/").at(-1));
    expect(result.text).toContain("crawl-manifest.json");
  });

  it("errors on missing path", async () => {
    const result = await executeCrawlRead(
      { path: join(TEST_DIR, "nope.md") },
      { outputRoot: TEST_DIR, cwd: process.cwd() }
    );
    expect(result.text).toMatch(/not found/i);
  });
});

describe("registerCrawlReadTool", () => {
  it("registers crawl_read tool", async () => {
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

it("recovers late minified matches with revision-bound UTF-16 continuation", async () => {
  const directory = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "crawl-late-"));
  const path = require("node:path").join(directory, "source.html");
  const content = "x".repeat(44000) + " CreatorAlpha " + "x".repeat(7000) + " CreatorBeta " + "x".repeat(35000);
  require("node:fs").writeFileSync(path, content);
  try {
    const first = await executeCrawlRead({ path, query: "CreatorAlpha CreatorBeta", maxChars: 2000 }, { outputRoot: directory });
    expect(first.text).toContain("CreatorAlpha");
    expect(Value.Check(ReadEvidenceSchema, first.details.evidence)).toBe(true);
    expect(first.text).toContain("Next call: crawl_read");
    const next = await executeCrawlRead(first.details.nextCall as any, { outputRoot: directory });
    expect(next.text).toContain("CreatorBeta");
    const ranges = first.details.ranges as Array<{ start: number; end: number; text: string }>;
    expect(content.slice(ranges[0].start, ranges[0].end)).toBe(ranges[0].text);
    const small = await executeCrawlRead({ path, query: "CreatorAlpha", maxChars: 540 }, { outputRoot: directory });
    expect(small.text.includes("CreatorAlpha") || small.details.error === "insufficient_budget").toBe(true);
    require("node:fs").writeFileSync(path, Array.from({ length: 85 }, (_, i) => "x".repeat(990) + (i === 70 ? " TargetCreator" : "")).join("\n"));
    const multiline = await executeCrawlRead({ path, query: "TargetCreator", maxChars: 2000 }, { outputRoot: directory });
    expect(multiline.text).toContain("TargetCreator");
    require("node:fs").writeFileSync(path, "same\nsame\nsame\nsame\n");
    const repeated = await executeCrawlRead({ path, mode: "window", offset: 3, limit: 1, maxChars: 2000 }, { outputRoot: directory });
    expect((repeated.details.ranges as any[])[0].start).toBe(10);
    expect((repeated.details.ranges as any[])[0].end).toBe(14);
    require("node:fs").writeFileSync(path, content + "changed");
    expect((await executeCrawlRead(first.details.nextCall as any, { outputRoot: directory })).details.error).toBe("source_revision_changed");
  } finally { require("node:fs").rmSync(directory, { recursive: true, force: true }); }
});

describe("bounded manifest metadata", () => {
  beforeEach(cleanup);
  afterEach(cleanup);
  it("returns complete typed pages and revision-bound continuation despite capped presentation JSON", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const path = resolve(TEST_DIR, "crawl-manifest.json");
    const pages = Array.from({ length: 25 }, (_, index) => ({ url: `https://example.com/${index}`, file: `${index}.md`, evidence: {
      acquisitionId: `acquisition-${index}`, views: [{ id: `original_html:hash-${index}`, kind: "original_html", sha256: `hash-${index}`, path: `${index}.raw.html` }],
    } }));
    writeFileSync(path, JSON.stringify({ version: 1, pages }));
    const first = await executeCrawlRead({ path, mode: "full", maxChars: 200 }, { outputRoot: TEST_DIR });
    const metadata = first.details.evidence.manifestMetadata!;
    expect(Value.Check(ReadEvidenceSchema, first.details.evidence)).toBe(true);
    expect(first.details.truncated).toBe(true);
    expect(metadata).toMatchObject({ totalPages: 25, complete: false });
    expect(metadata.pages).toHaveLength(20);
    expect(metadata.pages[0]).toMatchObject({ url: pages[0].url, acquisitionId: "acquisition-0", views: [{ id: "original_html:hash-0", sha256: "hash-0", path: resolve(TEST_DIR, "0.raw.html") }] });
    const next = await executeCrawlRead(metadata.nextCall!, { outputRoot: TEST_DIR });
    const rest = next.details.evidence.manifestMetadata!;
    expect(rest).toMatchObject({ totalPages: 25, complete: true, nextCall: null });
    expect(rest.pages).toHaveLength(5);
    expect(rest.pages[0].url).toBe(pages[20].url);
    writeFileSync(path, JSON.stringify({ version: 1, pages: pages.slice(1) }));
    expect((await executeCrawlRead(metadata.nextCall!, { outputRoot: TEST_DIR })).details.error).toBe("source_revision_changed");
  });
});

it("extracts retained HTML without refetching and preserves acquired siblings on failure", async () => {
  const { pageEvidence, evidenceView } = await import("./evidence");
  const directory = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "crawl-article-"));
  const url = "https://agency.example.com/article";
  const other = "https://agency.example.com/social";
  const html = "<html><article>Rendered source</article></html>";
  const empty = "<html>no article</html>";
  let sessionDir = createCrawlSession(directory, [url, other]);
  const python = join(directory, "controlled-python");
  writeFileSync(python, `#!/usr/bin/env node\nlet s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{if(s.includes('no article')){process.stderr.write('no extractable content');process.exit(1)}process.stdout.write('# Article\\n'+ 'Useful creator context. '.repeat(600));});`, { mode: 0o755 });
  writeCrawlArtifact(sessionDir, "original.raw.html", html);
  writeCrawlArtifact(sessionDir, "other.raw.html", empty);
  const results = [html, empty].map((body, i) => {
    const result = { url: i ? other : url, success: true, html: body, markdown: "Original creator cards", status_code: 200 };
    return { ...result, evidence: { ...pageEvidence(result, result.markdown), views: [evidenceView("requested", result.markdown), evidenceView("original_html", body)] } };
  });
  const saved = saveCrawlResultsDetailed(directory, [url, other], results, "markdown", undefined,
    { sessionDir, artifacts: [{ rawHtmlFile: "original.raw.html" }, { rawHtmlFile: "other.raw.html" }] });
  // Restored assignments retain old absolute evidence paths; rawHtmlFile stays session-relative.
  const previous = sessionDir;
  sessionDir = join(directory, "restored-session");
  renameSync(previous, sessionDir);
  saved.manifestPath = join(sessionDir, "crawl-manifest.json");
  saved.pagePaths.forEach(page => { page.path = join(sessionDir, page.file); });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(() => { throw new Error("Unexpected refetch"); });
  try {
    const read = await executeCrawlRead({ path: saved.pagePaths[0].path, extractor: "trafilatura", mode: "full", maxChars: 2000 },
      { outputRoot: directory, pythonPath: python });
    expect(read.text).toContain("Useful creator context");
    expect(Value.Check(ReadEvidenceSchema, read.details.evidence)).toBe(true);
    expect(read.details.derivation).toMatchObject({ path: join(sessionDir, "original.raw.html") });
    const next = await executeCrawlRead(read.details.evidence.nextCall!, { outputRoot: directory });
    expect(next.details.evidence.revision).toBe(read.details.evidence.revision);
    const manifest = JSON.parse(readFileSync(saved.manifestPath, "utf8"));
    expect(manifest.pages[0].evidence.acquisitionId).toBe(results[0].evidence.acquisitionId);
    expect(manifest.pages[0].evidence.views.some((view: any) => view.kind === "trafilatura")).toBe(true);
    await expect(executeCrawlRead({ path: saved.pagePaths[1].path, extractor: "trafilatura" }, { outputRoot: directory, pythonPath: python })).rejects.toThrow("original remains available");
    expect(readFileSync(join(sessionDir, "original.raw.html"), "utf8")).toBe(html);
    expect(readFileSync(join(sessionDir, "other.raw.html"), "utf8")).toBe(empty);
    expect((await executeCrawlRead({ path: saved.pagePaths[1].path, mode: "full" }, { outputRoot: directory })).text).toContain("Original creator cards");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    writeFileSync(join(sessionDir, "original.raw.html"), "changed");
    await expect(executeCrawlRead({ path: saved.pagePaths[0].path, extractor: "trafilatura" }, { outputRoot: directory, pythonPath: python })).rejects.toThrow("source_revision_changed");
  } finally {
    globalThis.fetch = oldFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
