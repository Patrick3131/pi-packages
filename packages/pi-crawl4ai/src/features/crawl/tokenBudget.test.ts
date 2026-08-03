/**
 * Tests for token-budget helpers and before/after size comparison.
 */

import type { CrawlResult } from "./types";
import {
  DEFAULT_TOKEN_BUDGET,
  applyInlineBudgets,
  buildBudgetedToolText,
  buildLegacyFullInlineText,
  decideReturnMode,
  extractMarkdownContent,
  makeExcerpt,
  normalizeContent,
  slimResultDetails,
  toFormattedPages,
  truncateContent,
} from "./tokenBudget";

function makePage(url: string, content: string, depth = 0): CrawlResult {
  return {
    url,
    success: true,
    markdown: content,
    metadata: { depth, title: `Title for ${url}` },
    status_code: 200,
  };
}

function makeLargeMarkdown(chars: number, label = "PAGE"): string {
  const unit = `${label} content with some boilerplate navigation and footer text. `;
  return unit.repeat(Math.ceil(chars / unit.length)).slice(0, chars);
}

describe("extractMarkdownContent", () => {
  it("prefers fit_markdown when enabled", () => {
    const result: CrawlResult = {
      url: "https://example.com",
      success: true,
      markdown: {
        raw_markdown: "RAW " + "x".repeat(1000),
        markdown_with_citations: "cited",
        references_markdown: "refs",
        fit_markdown: "FIT main content",
      },
    };

    expect(extractMarkdownContent(result, true)).toEqual({
      content: "FIT main content",
      usedFitMarkdown: true,
    });
  });

  it("uses raw_markdown when preferFitMarkdown is false", () => {
    const result: CrawlResult = {
      url: "https://example.com",
      success: true,
      markdown: {
        raw_markdown: "RAW body",
        markdown_with_citations: "cited",
        references_markdown: "refs",
        fit_markdown: "FIT body",
      },
    };

    expect(extractMarkdownContent(result, false)).toEqual({
      content: "RAW body",
      usedFitMarkdown: false,
    });
  });
});

describe("truncateContent / normalizeContent", () => {
  it("truncates with a marker", () => {
    const { content, truncated, originalChars } = truncateContent("abcdefghij", 8);
    expect(truncated).toBe(true);
    expect(originalChars).toBe(10);
    expect(content).toContain("truncated 10 → 8 chars");
    expect(content.length).toBeLessThanOrEqual(8 + 40); // marker may slightly exceed tight cap
  });

  it("collapses blank lines and strips images", () => {
    const input = "Hello\n\n\n\n![logo](http://x/y.png)\n\nWorld";
    expect(normalizeContent(input, { stripImages: true })).toBe("Hello\n\nWorld");
  });

  it("makeExcerpt shortens text", () => {
    expect(makeExcerpt("one two three four", 10)).toMatch(/…$/);
    expect(makeExcerpt("short", 100)).toBe("short");
  });
});

describe("decideReturnMode", () => {
  const pages = toFormattedPages(
    [makePage("https://a.com", "a"), makePage("https://b.com", "b")],
    "markdown",
    DEFAULT_TOKEN_BUDGET
  );

  it("uses files mode for multi-page deep crawl in auto", () => {
    const decision = decideReturnMode({
      requestedMode: "auto",
      pages,
      isDeepCrawl: true,
      urlCount: 1,
      maxCharsPerCall: 40_000,
      saveRequested: undefined,
    });
    expect(decision.mode).toBe("files");
    expect(decision.autoSave).toBe(true);
  });

  it("uses files mode when total chars exceed budget", () => {
    const big = toFormattedPages(
      [makePage("https://a.com", makeLargeMarkdown(50_000))],
      "markdown",
      DEFAULT_TOKEN_BUDGET
    );
    const decision = decideReturnMode({
      requestedMode: "auto",
      pages: big,
      isDeepCrawl: false,
      urlCount: 1,
      maxCharsPerCall: 40_000,
      saveRequested: undefined,
    });
    expect(decision.mode).toBe("files");
    expect(decision.reason).toContain("maxCharsPerCall");
  });

  it("stays inline for small single pages", () => {
    const small = toFormattedPages(
      [makePage("https://a.com", "hello world")],
      "markdown",
      DEFAULT_TOKEN_BUDGET
    );
    const decision = decideReturnMode({
      requestedMode: "auto",
      pages: small,
      isDeepCrawl: false,
      urlCount: 1,
      maxCharsPerCall: 40_000,
      saveRequested: undefined,
    });
    expect(decision.mode).toBe("inline");
  });
});

describe("applyInlineBudgets", () => {
  it("caps per page and total call budget", () => {
    const pages = toFormattedPages(
      [
        makePage("https://a.com", makeLargeMarkdown(20_000, "A")),
        makePage("https://b.com", makeLargeMarkdown(20_000, "B")),
      ],
      "markdown",
      DEFAULT_TOKEN_BUDGET
    );

    const budgeted = applyInlineBudgets(pages, 5_000, 8_000);
    expect(budgeted[0].truncated).toBe(true);
    expect(budgeted[0].returnedChars).toBeLessThanOrEqual(5_000);
    const total = budgeted.reduce((sum, p) => sum + p.returnedChars, 0);
    expect(total).toBeLessThanOrEqual(8_000);
  });
});

describe("slimResultDetails", () => {
  it("does not embed full page bodies", () => {
    const results = [makePage("https://a.com", makeLargeMarkdown(5_000))];
    const pages = toFormattedPages(results, "markdown", DEFAULT_TOKEN_BUDGET);
    const slim = slimResultDetails(pages, results);
    expect(slim[0].url).toBe("https://a.com");
    expect(slim[0].success).toBe(true);
    // normalizeContent may trim trailing whitespace from generated text
    expect(slim[0].charCount).toBeGreaterThan(4_900);
    expect(slim[0].charCount).toBeLessThanOrEqual(5_000);
    expect(JSON.stringify(slim)).not.toContain("A content with some boilerplate");
  });
});

describe("before/after token reduction benchmark", () => {
  const executionSummary =
    "*Execution:* siteHint=none auth=none authReason=none egress=server-managed cookies=no headers=no userAgent=no";

  it("reduces deep-crawl tool text dramatically vs legacy full dump", () => {
    const results: CrawlResult[] = Array.from({ length: 12 }, (_, i) => ({
      url: `https://docs.example.com/page-${i}`,
      success: true,
      status_code: 200,
      markdown: {
        raw_markdown: makeLargeMarkdown(25_000, `RAW${i}`),
        markdown_with_citations: "",
        references_markdown: "",
        fit_markdown: makeLargeMarkdown(8_000, `FIT${i}`),
      },
      metadata: { depth: i === 0 ? 0 : 1, title: `Doc ${i}` },
    }));

    const legacy = buildLegacyFullInlineText(results, "markdown", executionSummary, {
      deepCrawlMaxDepth: 2,
    });

    const budget = { ...DEFAULT_TOKEN_BUDGET };
    const pages = toFormattedPages(results, "markdown", budget);
    const decision = decideReturnMode({
      requestedMode: "auto",
      pages,
      isDeepCrawl: true,
      urlCount: 1,
      maxCharsPerCall: budget.maxCharsPerCall,
      saveRequested: undefined,
    });
    const modern = buildBudgetedToolText({
      pages,
      rawResults: results,
      budget,
      decision,
      isDeepCrawl: true,
      maxDepth: 2,
      savedPath: "./output-crawl4ai/docs.example.com-demo",
      executionSummary,
    });

    const reductionRatio = modern.text.length / legacy.length;
    // Expect at least 90% reduction for multi-page deep crawl (files/index mode)
    expect(modern.mode).toBe("files");
    expect(modern.text.length).toBeLessThan(legacy.length * 0.1);
    expect(modern.text).toContain("Page index");
    expect(modern.text).not.toContain(makeLargeMarkdown(8_000, "FIT0").slice(0, 500));

    // Surface numbers for the test runner output
    // eslint-disable-next-line no-console
    console.log(
      `[token-budget benchmark] deep-crawl: legacy=${legacy.length} modern=${modern.text.length} ratio=${(reductionRatio * 100).toFixed(2)}% of original`
    );
  });

  it("prefers fit markdown and truncates oversized single pages", () => {
    const result: CrawlResult = {
      url: "https://example.com/long",
      success: true,
      markdown: {
        raw_markdown: makeLargeMarkdown(80_000, "RAW"),
        markdown_with_citations: "",
        references_markdown: "",
        fit_markdown: makeLargeMarkdown(50_000, "FIT"),
      },
      metadata: { title: "Long page" },
    };

    const legacy = buildLegacyFullInlineText([result], "markdown", executionSummary);
    const budget = { ...DEFAULT_TOKEN_BUDGET };
    const pages = toFormattedPages([result], "markdown", budget);
    // fit should be used
    expect(pages[0].usedFitMarkdown).toBe(true);
    expect(pages[0].originalChars).toBe(50_000);

    const decision = decideReturnMode({
      requestedMode: "auto",
      pages,
      isDeepCrawl: false,
      urlCount: 1,
      maxCharsPerCall: budget.maxCharsPerCall,
      saveRequested: undefined,
    });
    // 50k > 40k call budget → files mode
    expect(decision.mode).toBe("files");

    const modern = buildBudgetedToolText({
      pages,
      rawResults: [result],
      budget,
      decision,
      isDeepCrawl: false,
      savedPath: "./output-crawl4ai/example.com-long",
      executionSummary,
    });

    const reductionRatio = modern.text.length / legacy.length;
    expect(modern.text.length).toBeLessThan(legacy.length * 0.05);

    // eslint-disable-next-line no-console
    console.log(
      `[token-budget benchmark] large-single: legacy=${legacy.length} modern=${modern.text.length} ratio=${(reductionRatio * 100).toFixed(2)}% of original (fit preferred, files mode)`
    );
  });

  it("keeps small pages fully inline with fit markdown savings", () => {
    const result: CrawlResult = {
      url: "https://example.com/small",
      success: true,
      markdown: {
        raw_markdown: makeLargeMarkdown(4_000, "RAW"),
        markdown_with_citations: "",
        references_markdown: "",
        fit_markdown: makeLargeMarkdown(1_500, "FIT"),
      },
    };

    const legacy = buildLegacyFullInlineText([result], "markdown", executionSummary);
    const budget = { ...DEFAULT_TOKEN_BUDGET };
    const pages = toFormattedPages([result], "markdown", budget);
    const decision = decideReturnMode({
      requestedMode: "auto",
      pages,
      isDeepCrawl: false,
      urlCount: 1,
      maxCharsPerCall: budget.maxCharsPerCall,
      saveRequested: false,
    });
    const modern = buildBudgetedToolText({
      pages,
      rawResults: [result],
      budget,
      decision,
      isDeepCrawl: false,
      executionSummary,
    });

    expect(modern.mode).toBe("inline");
    expect(modern.text).toContain("FIT content");
    expect(modern.text).not.toContain("RAW content");
    expect(modern.text.length).toBeLessThan(legacy.length);

    // eslint-disable-next-line no-console
    console.log(
      `[token-budget benchmark] small-page fit: legacy=${legacy.length} modern=${modern.text.length} ratio=${((modern.text.length / legacy.length) * 100).toFixed(2)}% of original`
    );
  });
});
