/** Tests for fixed previews, saved-page indexes and host output limits. */
import type { CrawlResult } from "./types";
jest.mock("@earendil-works/pi-coding-agent", () => {
  const path = require("node:path");
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(source, { format: "cjs" }).code)(module, module.exports);
  return { ...module.exports, defineTool: (tool: unknown) => tool };
}, { virtual: true });

import {
  DEFAULT_PREVIEW_SETTINGS, applyInlineBudgets, buildBudgetedToolText,
  decideReturnMode, extractMarkdownContent, makeExcerpt, normalizeContent,
  slimResultDetails, toFormattedPages, truncateContent, capToolText,
} from "./presentation";

function makePage(url: string, content: string, depth = 0): CrawlResult {
  return { url, success: true, markdown: content, metadata: { depth, title: `Title for ${url}` }, status_code: 200 };
}

function markdownPage(): CrawlResult {
  return { url: "https://example.com", success: true, markdown: {
    raw_markdown: "RAW body", markdown_with_citations: "cited", references_markdown: "refs", fit_markdown: "FIT body",
  } };
}

describe("extractMarkdownContent", () => {
  it("prefers fit Markdown by default and honors an explicit raw preference", () => {
    expect(extractMarkdownContent(markdownPage(), true)).toEqual({ content: "FIT body", usedFitMarkdown: true });
    expect(extractMarkdownContent(markdownPage(), false)).toEqual({ content: "RAW body", usedFitMarkdown: false });
  });
  it("uses raw Markdown when fit Markdown is absent or empty", () => {
    const result = markdownPage();
    if (typeof result.markdown === "object") result.markdown.fit_markdown = "";
    expect(extractMarkdownContent(result, true)).toEqual({ content: "RAW body", usedFitMarkdown: false });
  });
});

describe("preview normalization and truncation", () => {
  it("truncates with a bounded marker", () => {
    const result = truncateContent("abcdefghij", 8);
    expect(result.truncated).toBe(true); expect(result.originalChars).toBe(10);
    expect(result.content.length).toBeLessThanOrEqual(8);
  });
  it("collapses blank lines and strips preview images", () => {
    expect(normalizeContent("Hello\n\n\n\n![logo](http://x/y.png)\n\nWorld", { stripImages: true })).toBe("Hello\n\nWorld");
  });
  it("shortens index excerpts", () => {
    expect(makeExcerpt("one two three four", 10)).toMatch(/…$/);
    expect(makeExcerpt("short", 100)).toBe("short");
  });
});

describe("decideReturnMode", () => {
  it("uses file references by default independent of page size", () => {
    expect(decideReturnMode({ requestedMode: "auto", saveRequested: undefined }).mode).toBe("files");
  });
  it("uses bounded inline for explicit previews or no-save", () => {
    expect(decideReturnMode({ requestedMode: "inline", saveRequested: undefined }).mode).toBe("inline");
    expect(decideReturnMode({ requestedMode: "auto", saveRequested: false }).mode).toBe("inline");
    expect(() => decideReturnMode({ requestedMode: "files", saveRequested: false })).toThrow("requires saving");
  });
});

describe("applyInlineBudgets", () => {
  it("zero, negative, tiny and exhausted budgets never become unlimited", () => {
    for (const cap of [0, -1, 1, 10]) expect(truncateContent("x".repeat(100), cap).content.length).toBeLessThanOrEqual(Math.max(0, cap));
    const pages = toFormattedPages([makePage("https://a.com", "x".repeat(100)), makePage("https://b.com", "y".repeat(100))], "markdown", DEFAULT_PREVIEW_SETTINGS);
    expect(applyInlineBudgets(pages, 50, 50)[1].content).toBe("");
  });
  it("host byte/line caps retain exact recovery pointers", () => {
    const pointer = "/saved/session/crawl-manifest.json";
    for (const content of ["文".repeat(100000), "line\n".repeat(5000)]) {
      const capped = capToolText(content, pointer);
      expect(Buffer.byteLength(capped)).toBeLessThanOrEqual(50 * 1024);
      expect(capped.split("\n").length).toBeLessThanOrEqual(2000);
      expect(capped).toContain(pointer);
    }
    expect(capToolText("content", pointer, 0)).toBe("");
  });
  it("caps per-page and total body characters", () => {
    const pages = toFormattedPages([makePage("https://a.com", "a".repeat(20000)), makePage("https://b.com", "b".repeat(20000))], "markdown", DEFAULT_PREVIEW_SETTINGS);
    const budgeted = applyInlineBudgets(pages, 5000, 8000);
    expect(budgeted[0].truncated).toBe(true);
    expect(budgeted[0].returnedChars).toBeLessThanOrEqual(5000);
    expect(budgeted.reduce((sum, page) => sum + page.returnedChars, 0)).toBeLessThanOrEqual(8000);
  });
});

describe("slimResultDetails", () => {
  it("does not embed full bodies", () => {
    const results = [makePage("https://a.com", "a".repeat(5000))];
    const slim = slimResultDetails(toFormattedPages(results, "markdown", DEFAULT_PREVIEW_SETTINGS), results);
    expect(slim[0]).toMatchObject({ url: "https://a.com", success: true, charCount: 5000 });
    expect(JSON.stringify(slim)).not.toContain("a".repeat(5000));
  });
});

describe("buildBudgetedToolText", () => {
  it("caps the displayed index at 20 entries and preserves manifest recovery", () => {
    const results = Array.from({ length: 25 }, (_, i) => makePage(`https://docs.example.com/page-${i}`, "body".repeat(5000), i ? 1 : 0));
    const pages = toFormattedPages(results, "markdown", DEFAULT_PREVIEW_SETTINGS);
    const manifestPath = "/saved/session/crawl-manifest.json";
    const result = buildBudgetedToolText({ pages, budget: DEFAULT_PREVIEW_SETTINGS,
      decision: decideReturnMode({ requestedMode: "auto", saveRequested: undefined }),
      isDeepCrawl: true, maxDepth: 2, savedPath: "/saved/session", manifestPath,
      savedFiles: results.map((page, i) => ({ url: page.url, path: `/saved/session/${i}.md`, relativePath: `${i}.md` })),
      executionSummary: "*Execution:* egress=server-managed",
    });
    expect(result.mode).toBe("files"); expect(result.text).toContain("first 20 entries");
    expect(result.text).toContain(manifestPath); expect(result.text).toContain("/saved/session/19.md");
    expect(result.text).not.toContain("/saved/session/20.md");
    expect(result.text).not.toContain("body".repeat(500));
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(50 * 1024);
  });
  it("uses fixed inline defaults without claiming no-save recovery", () => {
    expect(DEFAULT_PREVIEW_SETTINGS).toEqual({ maxCharsPerPage: 12000, maxCharsPerCall: 12000, returnMode: "auto", preferFitMarkdown: true });
    const results = [makePage("https://example.com", "x".repeat(50000))];
    const result = buildBudgetedToolText({ pages: toFormattedPages(results, "markdown", DEFAULT_PREVIEW_SETTINGS),
      budget: DEFAULT_PREVIEW_SETTINGS, decision: decideReturnMode({ requestedMode: "auto", saveRequested: false }),
      isDeepCrawl: false, executionSummary: "*Execution:* egress=server-managed",
    });
    expect(result.mode).toBe("inline"); expect(result.totalReturnedChars).toBeLessThanOrEqual(12000);
    expect(result.text).toContain("not recoverable"); expect(result.truncated).toBe(true);
  });
});
