/**
 * Token-budget helpers for crawl tool results.
 *
 * Keeps large crawl bodies off the model context by preferring fit markdown,
 * enforcing char budgets, and returning file indexes when content is large.
 */

import type { CrawlFormat, CrawlResult, MarkdownGenerationResult } from "./types";

export type ReturnMode = "auto" | "inline" | "files";

export interface TokenBudgetConfig {
  /** Max characters of body content per page in the tool result. */
  maxCharsPerPage: number;
  /** Max total body characters returned for one crawl call. */
  maxCharsPerCall: number;
  /** How results are returned to the model. */
  returnMode: ReturnMode;
  /** Prefer crawl4ai fit_markdown (main content) over raw_markdown. */
  preferFitMarkdown: boolean;
  /** Default max pages for deep crawl when the model omits maxPages. */
  deepCrawlDefaultMaxPages: number;
  /** Excerpt length used in index / files mode. */
  excerptChars: number;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudgetConfig = {
  maxCharsPerPage: 12_000,
  maxCharsPerCall: 40_000,
  returnMode: "auto",
  preferFitMarkdown: true,
  deepCrawlDefaultMaxPages: 10,
  excerptChars: 200,
};

export interface FormattedPage {
  url: string;
  content: string;
  success: boolean;
  originalChars: number;
  returnedChars: number;
  truncated: boolean;
  usedFitMarkdown: boolean;
  title?: string;
  depth?: number;
  statusCode?: number;
  errorMessage?: string;
}

export interface SlimResultDetail {
  url: string;
  success: boolean;
  statusCode?: number;
  title?: string;
  charCount: number;
  truncated: boolean;
  usedFitMarkdown: boolean;
  depth?: number;
  parentUrl?: string;
  errorMessage?: string;
}

export interface BudgetDecision {
  mode: "inline" | "files";
  reason: string;
  autoSave: boolean;
}

export interface BuiltToolText {
  text: string;
  totalOriginalChars: number;
  totalReturnedChars: number;
  truncated: boolean;
  pages: FormattedPage[];
  mode: "inline" | "files";
}

function isMarkdownObject(value: unknown): value is MarkdownGenerationResult {
  return typeof value === "object" && value !== null;
}

/** Extract markdown body, preferring fit_markdown when configured. */
export function extractMarkdownContent(
  result: CrawlResult,
  preferFitMarkdown: boolean
): { content: string; usedFitMarkdown: boolean } {
  if (!result.success) {
    return {
      content: `**Error crawling ${result.url}:** ${result.error_message || "Unknown error"}`,
      usedFitMarkdown: false,
    };
  }

  if (isMarkdownObject(result.markdown)) {
    const md = result.markdown;
    if (preferFitMarkdown && md.fit_markdown && md.fit_markdown.trim().length > 0) {
      return { content: md.fit_markdown, usedFitMarkdown: true };
    }
    return {
      content: md.raw_markdown || "*No markdown content extracted*",
      usedFitMarkdown: false,
    };
  }

  return {
    content: result.markdown || "*No markdown content extracted*",
    usedFitMarkdown: false,
  };
}

/** Format a single page body for the requested output format (no budgeting). */
export function formatPageBody(
  result: CrawlResult,
  format: CrawlFormat,
  preferFitMarkdown: boolean
): { content: string; usedFitMarkdown: boolean } {
  if (!result.success) {
    return {
      content: `**Error crawling ${result.url}:** ${result.error_message || "Unknown error"}`,
      usedFitMarkdown: false,
    };
  }

  switch (format) {
    case "html":
      return {
        content: result.html || "*No HTML content extracted*",
        usedFitMarkdown: false,
      };
    case "links": {
      const internal = result.links?.internal || [];
      const external = result.links?.external || [];
      const content = [
        `### Internal Links (${internal.length})`,
        ...internal.slice(0, 50).map((l) => `- [${l.text}](${l.href})`),
        internal.length > 50 ? `... and ${internal.length - 50} more` : "",
        "",
        `### External Links (${external.length})`,
        ...external.slice(0, 50).map((l) => `- [${l.text}](${l.href})`),
        external.length > 50 ? `... and ${external.length - 50} more` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { content, usedFitMarkdown: false };
    }
    case "markdown":
    default:
      return extractMarkdownContent(result, preferFitMarkdown);
  }
}

/** Collapse excessive blank lines and optionally strip images. */
export function normalizeContent(content: string, options?: { stripImages?: boolean }): string {
  let next = content.replace(/\r\n/g, "\n");
  if (options?.stripImages) {
    next = next.replace(/!\[[^\]]*]\([^)]+\)/g, "");
  }
  next = next.replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

export function makeExcerpt(content: string, maxChars: number): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function truncateContent(
  content: string,
  maxChars: number
): { content: string; truncated: boolean; originalChars: number } {
  const originalChars = content.length;
  if (maxChars <= 0 || originalChars <= maxChars) {
    return { content, truncated: false, originalChars };
  }

  const marker = `\n\n… [truncated ${originalChars} → ${maxChars} chars]`;
  const bodyBudget = Math.max(0, maxChars - marker.length);
  return {
    content: `${content.slice(0, bodyBudget)}${marker}`,
    truncated: true,
    originalChars,
  };
}

export function toFormattedPages(
  results: CrawlResult[],
  format: CrawlFormat,
  budget: TokenBudgetConfig
): FormattedPage[] {
  return results.map((result) => {
    const { content: rawBody, usedFitMarkdown } = formatPageBody(
      result,
      format,
      budget.preferFitMarkdown
    );
    const content = normalizeContent(rawBody, { stripImages: format === "markdown" });
    return {
      url: result.url,
      content,
      success: result.success,
      originalChars: content.length,
      returnedChars: content.length,
      truncated: false,
      usedFitMarkdown,
      title: result.metadata?.title,
      depth: result.metadata?.depth,
      statusCode: result.status_code,
      errorMessage: result.error_message,
    };
  });
}

/**
 * Decide whether to inline full bodies or return a files/index view.
 */
export function decideReturnMode(options: {
  requestedMode: ReturnMode;
  pages: FormattedPage[];
  isDeepCrawl: boolean;
  urlCount: number;
  maxCharsPerCall: number;
  saveRequested: boolean | string | undefined;
}): BudgetDecision {
  const { requestedMode, pages, isDeepCrawl, urlCount, maxCharsPerCall, saveRequested } = options;
  const totalChars = pages.reduce((sum, page) => sum + page.originalChars, 0);
  const multiPage = pages.length > 1;
  const manyUrls = urlCount > 3;

  if (requestedMode === "files") {
    return {
      mode: "files",
      reason: "returnMode=files",
      autoSave: saveRequested !== false,
    };
  }

  if (requestedMode === "inline") {
    return {
      mode: "inline",
      reason: "returnMode=inline",
      autoSave: Boolean(saveRequested),
    };
  }

  // auto
  if (isDeepCrawl && multiPage) {
    return {
      mode: "files",
      reason: "deep crawl multi-page",
      autoSave: saveRequested !== false,
    };
  }
  if (manyUrls) {
    return {
      mode: "files",
      reason: "more than 3 URLs",
      autoSave: saveRequested !== false,
    };
  }
  if (totalChars > maxCharsPerCall) {
    return {
      mode: "files",
      reason: `total content ${totalChars} chars exceeds maxCharsPerCall ${maxCharsPerCall}`,
      autoSave: saveRequested !== false,
    };
  }

  return {
    mode: "inline",
    reason: "within budget",
    autoSave: Boolean(saveRequested),
  };
}

/** Apply per-page and global char budgets for inline mode. */
export function applyInlineBudgets(
  pages: FormattedPage[],
  maxCharsPerPage: number,
  maxCharsPerCall: number
): FormattedPage[] {
  let remainingCallBudget = maxCharsPerCall;
  return pages.map((page) => {
    const pageCap = Math.min(maxCharsPerPage, Math.max(0, remainingCallBudget));
    const truncated = truncateContent(page.content, pageCap);
    remainingCallBudget = Math.max(0, remainingCallBudget - truncated.content.length);
    return {
      ...page,
      content: truncated.content,
      returnedChars: truncated.content.length,
      truncated: truncated.truncated,
      originalChars: truncated.originalChars,
    };
  });
}

export function slimResultDetails(pages: FormattedPage[], rawResults: CrawlResult[]): SlimResultDetail[] {
  return pages.map((page, index) => {
    const raw = rawResults[index];
    return {
      url: page.url,
      success: page.success,
      statusCode: page.statusCode ?? raw?.status_code,
      title: page.title ?? raw?.metadata?.title,
      charCount: page.originalChars,
      truncated: page.truncated,
      usedFitMarkdown: page.usedFitMarkdown,
      depth: page.depth ?? raw?.metadata?.depth,
      parentUrl: raw?.metadata?.parent_url,
      errorMessage: page.errorMessage ?? raw?.error_message,
    };
  });
}

function formatIndexSections(
  pages: FormattedPage[],
  rawResults: CrawlResult[],
  excerptChars: number,
  isDeepCrawl: boolean,
  maxDepth?: number
): string {
  if (isDeepCrawl) {
    const byDepth = new Map<number, FormattedPage[]>();
    pages.forEach((page, index) => {
      const depth = page.depth ?? rawResults[index]?.metadata?.depth ?? 0;
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth)!.push({ ...page, depth });
    });

    const sections: string[] = [];
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    for (const depth of depths) {
      if (maxDepth !== undefined && depth > maxDepth) continue;
      const group = byDepth.get(depth) || [];
      sections.push(`### Depth ${depth} (${group.length} pages)`);
      for (const page of group) {
        const status = page.success ? "ok" : "error";
        const title = page.title ? ` — ${page.title}` : "";
        sections.push(
          `- [${status}] ${page.url} (${page.originalChars} chars)${title}`
        );
        sections.push(`  excerpt: ${makeExcerpt(page.content, excerptChars)}`);
      }
      sections.push("");
    }
    return sections.join("\n");
  }

  return pages
    .map((page, index) => {
      const status = page.success ? "ok" : "error";
      const title = page.title ? ` — ${page.title}` : "";
      return [
        `${index + 1}. [${status}] ${page.url} (${page.originalChars} chars)${title}`,
        `   excerpt: ${makeExcerpt(page.content, excerptChars)}`,
      ].join("\n");
    })
    .join("\n");
}

/**
 * Build the model-facing tool text under the chosen return mode and budgets.
 */
export function buildBudgetedToolText(options: {
  pages: FormattedPage[];
  rawResults: CrawlResult[];
  budget: TokenBudgetConfig;
  decision: BudgetDecision;
  isDeepCrawl: boolean;
  maxDepth?: number;
  savedPath?: string;
  executionSummary: string;
}): BuiltToolText {
  const {
    pages,
    rawResults,
    budget,
    decision,
    isDeepCrawl,
    maxDepth,
    savedPath,
    executionSummary,
  } = options;

  const totalOriginalChars = pages.reduce((sum, page) => sum + page.originalChars, 0);

  if (decision.mode === "files") {
    const header = isDeepCrawl
      ? `# Deep Crawl Results (${pages.length} pages${maxDepth !== undefined ? `, max depth: ${maxDepth}` : ""})`
      : `# Crawl Results (${pages.length} pages)`;

    const lines = [
      executionSummary,
      "",
      header,
      `*Return mode: files (${decision.reason}) — full page bodies kept off the model context.*`,
      savedPath ? `*Results saved to: ${savedPath}*` : "*Not saved to disk (save=false). Content is summarized only.*",
      `*Totals: ${totalOriginalChars} chars across ${pages.length} pages.*`,
      "",
      "## Page index",
      formatIndexSections(pages, rawResults, budget.excerptChars, isDeepCrawl, maxDepth),
      "",
      "Full content is on disk when saved. Use `read` on specific files for details, or re-crawl with `returnMode: \"inline\"` / higher budgets for a single page.",
    ];

    const text = lines.join("\n");
    return {
      text,
      totalOriginalChars,
      totalReturnedChars: text.length,
      truncated: true,
      pages,
      mode: "files",
    };
  }

  // inline mode with budgets
  const budgeted = applyInlineBudgets(pages, budget.maxCharsPerPage, budget.maxCharsPerCall);
  const anyTruncated = budgeted.some((page) => page.truncated);
  const saveNotice = savedPath ? `\n\n*Results saved to: ${savedPath}*` : "";
  const truncationNote = anyTruncated
    ? `\n\n*Some pages were truncated to maxCharsPerPage=${budget.maxCharsPerPage} / maxCharsPerCall=${budget.maxCharsPerCall}.${savedPath ? ` Full content: ${savedPath}` : " Re-crawl with save=true or higher budgets for full text."}*`
    : "";

  const body =
    budgeted.length === 1
      ? `## ${budgeted[0].url}\n\n${budgeted[0].content}${saveNotice}${truncationNote}`
      : budgeted
          .map((page, index) => `---\n## Result ${index + 1}: ${page.url}\n\n${page.content}`)
          .join("\n\n") + saveNotice + truncationNote;

  const text = [executionSummary, "", body].join("\n");
  const totalReturnedChars = budgeted.reduce((sum, page) => sum + page.returnedChars, 0);

  return {
    text,
    totalOriginalChars,
    totalReturnedChars,
    truncated: anyTruncated,
    pages: budgeted,
    mode: "inline",
  };
}

/**
 * Legacy (pre-budget) full inline dump used for before/after benchmarks.
 * Mirrors the old crawlTool formatting behavior as closely as practical.
 */
export function buildLegacyFullInlineText(
  results: CrawlResult[],
  format: CrawlFormat,
  executionSummary: string,
  options?: { deepCrawlMaxDepth?: number; savedPath?: string }
): string {
  const pages = results.map((result) => {
    // Legacy always preferred raw_markdown
    const { content } = formatPageBody(result, format, false);
    return { url: result.url, content, success: result.success };
  });

  if (options?.deepCrawlMaxDepth !== undefined && results.length > 1) {
    const byDepth = new Map<number, typeof pages>();
    pages.forEach((page, index) => {
      const depth = results[index].metadata?.depth ?? 0;
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth)!.push(page);
    });
    const sections: string[] = [];
    sections.push(`# Deep Crawl Results (${pages.length} pages, max depth: ${options.deepCrawlMaxDepth})\n`);
    if (options.savedPath) sections.push(`*Results saved to: ${options.savedPath}*\n`);
    for (let depth = 0; depth <= options.deepCrawlMaxDepth; depth++) {
      const group = byDepth.get(depth);
      if (!group?.length) continue;
      sections.push(`\n## Depth ${depth} (${group.length} pages)\n`);
      for (const page of group) {
        const prefix = page.success ? "" : "❌ ";
        sections.push(`\n### ${prefix}${page.url}\n\n${page.content}`);
      }
    }
    return [executionSummary, "", sections.join("\n")].join("\n");
  }

  const saveNotice = options?.savedPath ? `\n\n*Results saved to: ${options.savedPath}*` : "";
  const body =
    pages.length === 1
      ? `## ${pages[0].url}\n\n${pages[0].content}${saveNotice}`
      : pages.map((page, i) => `---\n## Result ${i + 1}: ${page.url}\n\n${page.content}`).join("\n\n") +
        saveNotice;
  return [executionSummary, "", body].join("\n");
}
