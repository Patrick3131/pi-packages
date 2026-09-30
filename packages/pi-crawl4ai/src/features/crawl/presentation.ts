/** Fixed, bounded crawl previews and compact saved-page indexes. */

import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";

/** Apply host byte/line limits after reserving an exact recovery reference. */
export function capToolText(text: string, pointer = "", maxChars = Number.MAX_SAFE_INTEGER): string {
  if (maxChars <= 0) return "";
  const footer = pointer ? `\n\n[Output may be omitted. Full artifact: ${pointer}]` : "\n\n[Output omitted; save=true to recover complete content.]";
  const capped = truncateHead(text.slice(0, maxChars), { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  if (!capped.truncated && text.length <= maxChars) return text;
  const safeFooter = truncateHead(footer.slice(0, maxChars), { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES }).content;
  const availableChars = Math.max(0, maxChars - safeFooter.length);
  const body = truncateHead(text.slice(0, availableChars), {
    maxBytes: Math.max(0, DEFAULT_MAX_BYTES - Buffer.byteLength(safeFooter)),
    maxLines: Math.max(0, DEFAULT_MAX_LINES - safeFooter.split("\n").length),
  }).content;
  return body + safeFooter;
}
import type { CrawlFormat, CrawlResult, MarkdownGenerationResult, ReturnMode } from "./types";

export interface PreviewSettings {
  /** Max characters of body content per page in the tool result. */
  maxCharsPerPage: number;
  /** Max total body characters returned for one crawl call. */
  maxCharsPerCall: number;
  /** How results are returned to the model. */
  returnMode: ReturnMode;
  /** Prefer crawl4ai fit_markdown (main content) over raw_markdown. */
  preferFitMarkdown: boolean;
}

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  maxCharsPerPage: 12_000,
  maxCharsPerCall: 12_000,
  returnMode: "auto",
  preferFitMarkdown: true,
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

export interface SavedPagePath {
  url: string;
  /** Path relative to the saved crawl session. */
  relativePath: string;
  /** Exact path to the saved page content. */
  path: string;
  outlinePath?: string;
  metaPath?: string;
  sourcePath?: string;
  rawHtmlPath?: string;
  filter?: { query: string; threshold: number; matchedSectionCount: number; totalSections: number };
  extractor?: { name: "trafilatura"; includeLinks: boolean };
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
  /** Exact saved page path when this crawl was persisted. */
  filePath?: string;
  /** Path relative to the saved crawl session. */
  relativeFilePath?: string;
}

export interface ReturnModeDecision {
  mode: "inline" | "files";
  reason: string;
}

export interface BuiltToolText {
  text: string;
  totalOriginalChars: number;
  totalReturnedChars: number;
  truncated: boolean;
  pages: FormattedPage[];
  mode: "inline" | "files";
  manifestPath?: string;
  savedFiles?: SavedPagePath[];
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
      content: md.raw_markdown ?? "",
      usedFitMarkdown: false,
    };
  }

  return {
    content: result.markdown ?? "",
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
        content: result.html ?? "",
        usedFitMarkdown: false,
      };
    case "links": {
      const internal = result.links?.internal || [];
      const external = result.links?.external || [];
      const content = [
        `### Internal Links (${internal.length})`,
        ...internal.map((l) => `- [${l.text}](${l.href})`),
        "",
        `### External Links (${external.length})`,
        ...external.map((l) => `- [${l.text}](${l.href})`),
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
  if (maxChars <= 0) return { content: "", truncated: originalChars > 0, originalChars };
  if (originalChars <= maxChars) return { content, truncated: false, originalChars };

  const marker = `\n\n… [truncated ${originalChars} → ${maxChars} chars]`;
  const bodyBudget = Math.max(0, maxChars - marker.length);
  return {
    content: `${content.slice(0, bodyBudget)}${marker.slice(0, maxChars)}`,
    truncated: true,
    originalChars,
  };
}

export function toFormattedPages(
  results: CrawlResult[],
  format: CrawlFormat,
  budget: PreviewSettings
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
  saveRequested: boolean | string | undefined;
}): ReturnModeDecision {
  const { requestedMode, saveRequested } = options;
  if (requestedMode === "files" && saveRequested === false) throw new Error("returnMode=files requires saving; save=false is incompatible");
  return {
    mode: requestedMode === "inline" || saveRequested === false ? "inline" : "files",
    reason: saveRequested === false ? "save=false" : `returnMode=${requestedMode} (file-first)`,
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

export function slimResultDetails(
  pages: FormattedPage[],
  rawResults: CrawlResult[],
  savedFiles?: SavedPagePath[]
): SlimResultDetail[] {
  return pages.map((page, index) => {
    const raw = rawResults[index];
    const saved = savedFiles?.[index];
    return {
      url: page.url,
      success: page.success,
      statusCode: page.statusCode,
      title: page.title,
      charCount: page.originalChars,
      truncated: page.truncated,
      usedFitMarkdown: page.usedFitMarkdown,
      depth: page.depth,
      parentUrl: raw?.metadata?.parent_url,
      errorMessage: page.errorMessage,
      filePath: saved?.path,
      relativeFilePath: saved?.relativePath,
    };
  });
}

function formatIndexSections(
  pages: FormattedPage[],
  excerptChars: number,
  isDeepCrawl: boolean,
  maxDepth?: number
): string {
  if (isDeepCrawl) {
    const byDepth = new Map<number, FormattedPage[]>();
    pages.forEach((page) => {
      const depth = page.depth ?? 0;
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
  budget: PreviewSettings;
  decision: ReturnModeDecision;
  isDeepCrawl: boolean;
  maxDepth?: number;
  savedPath?: string;
  manifestPath?: string;
  savedFiles?: SavedPagePath[];
  executionSummary: string;
}): BuiltToolText {
  const {
    pages,
    budget,
    decision,
    isDeepCrawl,
    maxDepth,
    savedPath,
    manifestPath,
    savedFiles,
    executionSummary,
  } = options;

  const totalOriginalChars = pages.reduce((sum, page) => sum + page.originalChars, 0);

  if (decision.mode === "files") {
    if (!savedPath || !manifestPath) throw new Error("File references require a saved session and manifest");
    const header = isDeepCrawl
      ? `# Deep Crawl Results (${pages.length} pages${maxDepth !== undefined ? `, max depth: ${maxDepth}` : ""})`
      : `# Crawl Results (${pages.length} pages)`;

    const savedFileLines = [
      "",
      "## Saved page files",
      `*Manifest: ${manifestPath}*`,
      "*Read crawl-manifest.json first with crawl_read, or use one of the exact page paths below. Do not invent flattened filenames.*",
      ...(savedFiles ?? []).slice(0, 20).flatMap((saved) => [
        `- ${saved.url} → ${saved.path}`,
        ...(saved.sourcePath ? [`  Original: ${saved.sourcePath}`] : []),
        ...(saved.rawHtmlPath ? [`  Raw HTML: ${saved.rawHtmlPath}`] : []),
        ...(saved.filter ? [`  BM25 query=${JSON.stringify(saved.filter.query)}, matched ${saved.filter.matchedSectionCount}/${saved.filter.totalSections} sections, threshold=${saved.filter.threshold}`] : []),
      ]),
    ];
    const lines = [
      executionSummary,
      "",
      header,
      `*Return mode: files (${decision.reason}) — full page bodies kept off the model context.*`,
      `*Results saved to: ${savedPath}*`,
      `*Totals: ${totalOriginalChars} chars across ${pages.length} pages.*`,
      "",
      "## Page index",
      formatIndexSections(pages.slice(0, 20), 200, isDeepCrawl, maxDepth),
      pages.length > 20 ? `Only the first 20 entries are shown; see the complete manifest (${pages.length} pages).` : "",
      ...savedFileLines,
      "",
      "Full content is on disk. Read crawl-manifest.json first or use the exact saved page paths above with crawl_read; never invent or flatten filenames.",
    ];

    const text = capToolText(lines.join("\n"), manifestPath);
    return {
      text,
      totalOriginalChars,
      totalReturnedChars: text.length,
      truncated: true,
      pages,
      mode: "files",
      manifestPath,
      savedFiles,
    };
  }

  // inline mode with budgets
  const budgeted = applyInlineBudgets(pages, budget.maxCharsPerPage, budget.maxCharsPerCall);
  const anyTruncated = budgeted.some((page) => page.truncated);
  const provenance = (savedFiles ?? []).slice(0, 20).flatMap(saved => [
    ...(saved.sourcePath ? [`Original: ${saved.sourcePath}`] : []),
    ...(saved.rawHtmlPath ? [`Raw HTML: ${saved.rawHtmlPath}`] : []),
  ]).join("\n");
  const saveNotice = savedPath
    ? `\n\n*Results saved to: ${savedPath}${manifestPath ? `. Manifest: ${manifestPath}` : ""}*${provenance ? `\n${provenance}` : ""}`
    : "\n\n*Results were not saved to disk (save=false); inline content is not recoverable via crawl_read. Use save=true to retain complete content.*";
  const truncationNote = anyTruncated
    ? `\n\n*Some pages were truncated to maxCharsPerPage=${budget.maxCharsPerPage} / maxCharsPerCall=${budget.maxCharsPerCall}.${savedPath ? ` Full content is in the saved session; read crawl-manifest.json first or use its exact page paths with crawl_read.` : " Truncated inline text is not recoverable from disk; re-crawl with save=true for full text."}*`
    : "";

  const body =
    budgeted.length === 1
      ? `## ${budgeted[0].url}\n\n${budgeted[0].content}${saveNotice}${truncationNote}`
      : budgeted
          .map((page, index) => `---\n## Result ${index + 1}: ${page.url}\n\n${page.content}`)
          .join("\n\n") + saveNotice + truncationNote;

  const text = capToolText([executionSummary, "", body].join("\n"), manifestPath);
  const totalReturnedChars = budgeted.reduce((sum, page) => sum + page.returnedChars, 0);

  return {
    text,
    totalOriginalChars,
    totalReturnedChars,
    truncated: anyTruncated,
    pages: budgeted,
    mode: "inline",
    manifestPath,
    savedFiles,
  };
}
