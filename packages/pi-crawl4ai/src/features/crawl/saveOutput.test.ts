import { urlToFilePath, resolveOutputDir, getDefaultOutputDir, formatContentForSave, createSessionDirName, saveCrawlResultsDetailed, createCrawlSession, writeCrawlArtifact, DEFAULT_OUTPUT_DIR, OUTPUT_DIR_ENV_VAR } from "./saveOutput";
import type { CrawlResult } from "./types";
import { existsSync, readFileSync, rmSync, readdirSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = "./__test_save_output__";
const URL = "https://example.com";
const PAGE: CrawlResult = { url: URL, success: true, markdown: "# Hello\n\nWorld" };
const originalEnv = process.env[OUTPUT_DIR_ENV_VAR];
beforeEach(() => { delete process.env[OUTPUT_DIR_ENV_VAR]; });
afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  if (originalEnv !== undefined) process.env[OUTPUT_DIR_ENV_VAR] = originalEnv;
  else delete process.env[OUTPUT_DIR_ENV_VAR];
});

describe("resolveOutputDir and default root", () => {
  it("defaults undefined/true to saving; false alone disables persistence", () => {
    expect(resolveOutputDir(undefined)).toBe(DEFAULT_OUTPUT_DIR); expect(resolveOutputDir(true)).toBe(DEFAULT_OUTPUT_DIR); expect(resolveOutputDir(false)).toBeNull();
    expect(resolveOutputDir("./custom")).toBe("./custom");
  });
  it("honors config before environment, and an explicit directory before both", () => {
    process.env[OUTPUT_DIR_ENV_VAR] = "./env";
    expect(getDefaultOutputDir()).toBe("./env"); expect(getDefaultOutputDir("./config")).toBe("./config");
    expect(resolveOutputDir(undefined, "./config")).toBe("./config"); expect(resolveOutputDir("./explicit", "./config")).toBe("./explicit");
  });
});

describe("urlToFilePath", () => {
  it.each(["https://example.com", "https://example.com/docs/api", "http://localhost:3000/page?q=1", "not-a-url", `https://example.com/${"a".repeat(5000)}`])("creates a bounded safe slug and full URL hash for %s", url => {
    const file = urlToFilePath(url, "markdown");
    expect(file).toMatch(/^[a-zA-Z0-9_-]+-[a-f0-9]{64}\.md$/); expect(file.length).toBeLessThanOrEqual(168);
    expect(urlToFilePath(url, "markdown")).toBe(file);
  });
  it("distinguishes queries, ports, protocols, slashes and lossy slugs", () => {
    const urls = ["https://example.com", "https://example.com/", "http://example.com/", "https://example.com:444/", "https://example.com/?x=a-b", "https://example.com/?x=ab", "https://example.com/a.b", "https://example.com/ab"];
    expect(new Set(urls.map(url => urlToFilePath(url, "markdown"))).size).toBe(urls.length);
  });
  it.each([["html", ".html"], ["text", ".txt"], ["links", ".md"]] as const)("uses %s extension", (format, extension) => {
    expect(urlToFilePath(URL, format).endsWith(extension)).toBe(true);
  });
});

describe("formatContentForSave", () => {
  it("saves full markdown and respects fit/raw selection", () => {
    expect(formatContentForSave(PAGE, "markdown")).toBe(PAGE.markdown);
    const page: CrawlResult = { ...PAGE, markdown: { raw_markdown: "RAW", fit_markdown: "FIT", markdown_with_citations: "", references_markdown: "" } };
    expect(formatContentForSave(page, "markdown")).toBe("FIT"); expect(formatContentForSave(page, "markdown", { preferFitMarkdown: false })).toBe("RAW");
  });
  it("saves full HTML/text and every link, without presentation caps", () => {
    expect(formatContentForSave({ ...PAGE, html: "<html>source</html>" }, "html")).toBe("<html>source</html>");
    expect(formatContentForSave(PAGE, "text")).toBe(PAGE.markdown);
    const links = Array.from({ length: 100 }, (_, i) => ({ href: `/${i}`, text: `Link ${i}` }));
    expect(formatContentForSave({ ...PAGE, links: { internal: links, external: links } }, "links")).toContain("[Link 99](/99)");
  });
  it("retains valid empty selection and meaningful page errors", () => {
    expect(formatContentForSave({ ...PAGE, markdown: "" }, "markdown")).toBe("");
    expect(formatContentForSave({ ...PAGE, success: false, error_message: "404" }, "markdown")).toContain("404");
    expect(formatContentForSave({ ...PAGE, success: false }, "markdown")).toContain("Unknown error");
  });
});

describe("saveCrawlResultsDetailed", () => {
  it("should save HTML format with correct extension and handle failed crawls", () => {
    const html = saveCrawlResultsDetailed(ROOT, [URL], [{ ...PAGE, html: "<html>full source</html>" }], "html");
    expect(html.pagePaths[0].path).toMatch(/\.html$/); expect(readFileSync(html.pagePaths[0].path, "utf8")).toBe("<html>full source</html>");
    const failed = saveCrawlResultsDetailed(ROOT, [URL], [{ ...PAGE, url: `${URL}/broken`, success: false, error_message: "404 Not Found" }], "markdown");
    expect(readFileSync(failed.pagePaths[0].path, "utf8")).toContain("404 Not Found");
    expect(JSON.parse(readFileSync(failed.manifestPath, "utf8")).pages[0].success).toBe(false);
  });
  it("should handle subdomains and nested paths without losing the original URL mapping", () => {
    const url = "https://docs.example.com/a/b/c/d?q=api";
    const saved = saveCrawlResultsDetailed(ROOT, [url], [{ ...PAGE, url }], "markdown");
    const manifest = JSON.parse(readFileSync(saved.manifestPath, "utf8"));
    expect(manifest.urls).toEqual([url]); expect(manifest.pages[0].url).toBe(url); expect(saved.pagePaths[0].file).toBe(urlToFilePath(url, "markdown"));
    expect(JSON.parse(readFileSync(saved.pagePaths[0].metaPath!, "utf8")).url).toBe(url);
  });

  it("saves complete bodies and sidecars before publishing an additive manifest", () => {
    const body = "# Heading\r\n\r\n" + "x".repeat(60000);
    const saved = saveCrawlResultsDetailed(ROOT, [URL], [{ ...PAGE, markdown: body }], "markdown", { maxDepth: 2, maxPages: 5 });
    const page = saved.pagePaths[0];
    expect(readFileSync(page.path, "utf8")).toBe(body);
    expect(existsSync(page.outlinePath!)).toBe(true); expect(existsSync(page.metaPath!)).toBe(true);
    const manifest = JSON.parse(readFileSync(saved.manifestPath, "utf8"));
    expect(manifest.totalPages).toBe(1); expect(manifest.files).toEqual([page.file]); expect(manifest.pages[0].charCount).toBe(body.length);
    expect(manifest.deepCrawl).toEqual({ maxDepth: 2, maxPages: 5 });
    expect(readdirSync(saved.sessionDir)).not.toContain(".crawl-manifest.pending");
  });
  it("exclusive session allocation cannot collide even at identical timestamps", () => {
    jest.useFakeTimers({ now: new Date("2025-01-01T00:00:00Z") });
    try {
      const first = saveCrawlResultsDetailed(ROOT, [URL], [PAGE], "markdown");
      const second = saveCrawlResultsDetailed(ROOT, [URL], [{ ...PAGE, markdown: "second" }], "markdown");
      expect(first.sessionDir).not.toBe(second.sessionDir); expect(readFileSync(first.pagePaths[0].path, "utf8")).toBe(PAGE.markdown);
      expect(readFileSync(second.pagePaths[0].path, "utf8")).toBe("second");
    } finally { jest.useRealTimers(); }
  });
  it("distinct and duplicate URLs never overwrite in one session", () => {
    const pages = [PAGE, { ...PAGE, url: `${URL}:444/path?q=1`, markdown: "port" }, { ...PAGE, url: `${URL}/path?q=1`, markdown: "query" }, { ...PAGE, markdown: "duplicate" }];
    const saved = saveCrawlResultsDetailed(ROOT, [URL], pages, "markdown");
    expect(new Set(saved.pagePaths.map(page => page.path)).size).toBe(4);
    expect(saved.pagePaths.map(page => readFileSync(page.path, "utf8"))).toEqual(pages.map(page => page.markdown));
  });
  it("failed page writes never publish a completed manifest", () => {
    const sessionDir = createCrawlSession(ROOT, [URL]);
    writeCrawlArtifact(sessionDir, urlToFilePath(URL, "markdown"), "existing");
    expect(() => saveCrawlResultsDetailed(ROOT, [URL], [PAGE], "markdown", undefined, { sessionDir })).toThrow();
    expect(existsSync(join(sessionDir, "crawl-manifest.json"))).toBe(false);
    expect(readFileSync(join(sessionDir, urlToFilePath(URL, "markdown")), "utf8")).toBe("existing");
  });
  it("generated writes reject traversal and symlink escape", () => {
    const session = createCrawlSession(ROOT, [URL]);
    const outside = resolve(ROOT, "outside"); mkdirSync(outside);
    symlinkSync(outside, join(session, "escape"));
    expect(() => writeCrawlArtifact(session, "../outside/evil", "bad")).toThrow("escapes");
    expect(() => writeCrawlArtifact(session, "escape/evil", "bad")).toThrow("escapes");
    expect(existsSync(join(outside, "evil"))).toBe(false);
  });
  it("source/raw HTML provenance is optional and primary file remains the requested output", () => {
    const sessionDir = createCrawlSession(ROOT, [URL]); writeCrawlArtifact(sessionDir, "raw.html", "<html>source</html>");
    const filter = { query: "hello", threshold: 0, matchedSectionCount: 1, totalSections: 2 };
    const extractor = { name: "trafilatura" as const, includeLinks: false };
    const saved = saveCrawlResultsDetailed(ROOT, [URL], [PAGE], "markdown", undefined, { sessionDir, artifacts: [{ sourceContent: "full original", rawHtmlFile: "raw.html", filter, extractor }] });
    const page = saved.pagePaths[0]; const manifest = JSON.parse(readFileSync(saved.manifestPath, "utf8"));
    expect(readFileSync(page.sourcePath!, "utf8")).toBe("full original"); expect(readFileSync(page.rawHtmlPath!, "utf8")).toBe("<html>source</html>");
    expect(manifest.pages[0].file).toBe(page.file); expect(manifest.pages[0].filter).toEqual(filter); expect(manifest.pages[0].extractor).toEqual(extractor);
  });
  it("new oversized returned session survives its cleanup pass", () => {
    const saved = saveCrawlResultsDetailed(ROOT, [URL], [{ ...PAGE, markdown: "x".repeat(5000) }], "markdown", undefined, { retention: { enabled: true, maxSessions: 1, maxAgeDays: 1, maxTotalMb: 0.001 } });
    expect(saved.cleanup?.deleted).toEqual([]); expect(existsSync(saved.manifestPath)).toBe(true);
  });
  it("session prefix remains bounded and filesystem safe", () => {
    expect(createSessionDirName(URL, new Date("2025-03-25T14:30:00Z"))).toMatch(/example-com-2025-03-25T14-30-00/);
    expect(createSessionDirName("invalid", new Date())).toMatch(/^unknown-/);
  });
});
