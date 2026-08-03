/**
 * Save crawl results to disk.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { CrawlResult, CrawlFormat, MarkdownGenerationResult } from "./types";
import {
  cleanupCrawlSessions,
  type CleanupResult,
  type RetentionPolicy,
} from "./cleanup";
import { buildOutlineMarkdown, buildPageMeta } from "./outline";

/**
 * Default output directory for saved crawls.
 */
export const DEFAULT_OUTPUT_DIR = "./output-crawl4ai";

/**
 * Environment variable name for custom default output directory.
 */
export const OUTPUT_DIR_ENV_VAR = "CRAWL4AI_OUTPUT_DIR";

/**
 * Get the default output directory, checking env var first.
 * Optional configDefault lets runtime config override env.
 */
export function getDefaultOutputDir(configDefault?: string): string {
  if (configDefault && configDefault.trim()) return configDefault;
  return process.env[OUTPUT_DIR_ENV_VAR] || DEFAULT_OUTPUT_DIR;
}

/**
 * Resolve the output directory from the save parameter.
 * - undefined/null → null (don't save)
 * - true → use default directory
 * - string → use as custom path
 */
export function resolveOutputDir(
  save: boolean | string | undefined,
  configDefault?: string
): string | null {
  if (save === undefined || save === false) {
    return null;
  }
  if (save === true) {
    return getDefaultOutputDir(configDefault);
  }
  return save;
}

/**
 * Sanitize a URL to a safe filesystem path component.
 * 
 * Examples:
 * - https://example.com → example.com/index.md
 * - https://example.com/docs/api → example.com/docs/api.md
 * - https://example.com/search?q=test&page=1 → example.com/search_q_test_page_1.md
 */
export function urlToFilePath(url: string, format: CrawlFormat): string {
  try {
    const parsed = new URL(url);
    
    // Get path, remove leading slash, handle empty path
    let path = parsed.pathname.slice(1);
    if (!path || path === "/") {
      path = "index";
    }
    
    // Remove trailing slash
    path = path.replace(/\/$/, "");
    
    // Add query string if present (sanitized)
    if (parsed.search && parsed.search.length > 1) {
      // Convert ?q=test&page=1 to _q_test_page_1
      const sanitizedQuery = parsed.search
        .slice(1) // Remove leading ?
        .replace(/[=&?]/g, "_") // Replace special chars with underscore
        .replace(/[^a-zA-Z0-9_\-./]/g, ""); // Remove other unsafe chars
      path = `${path}_${sanitizedQuery}`;
    }
    
    // Determine file extension
    const ext = format === "html" ? "html" : "md";
    
    // Combine domain and path
    const domain = parsed.hostname;
    
    return `${domain}/${path}.${ext}`;
  } catch {
    // Fallback for invalid URLs: hash-based filename
    const hash = Buffer.from(url).toString("base64url").slice(0, 16);
    const ext = format === "html" ? "html" : "md";
    return `unknown/${hash}.${ext}`;
  }
}

/**
 * Format content for saving based on format type.
 */
export function formatContentForSave(
  result: CrawlResult,
  format: CrawlFormat,
  options?: { preferFitMarkdown?: boolean }
): string {
  if (!result.success) {
    return `# Error: ${result.url}\n\n${result.error_message || "Unknown error"}`;
  }

  switch (format) {
    case "html":
      return result.html || "<!-- No HTML content -->";
    case "links": {
      const internal = result.links?.internal || [];
      const external = result.links?.external || [];
      const lines = [
        `# Links from ${result.url}`,
        "",
        `## Internal Links (${internal.length})`,
        ...internal.map((l) => `- [${l.text}](${l.href})`),
        "",
        `## External Links (${external.length})`,
        ...external.map((l) => `- [${l.text}](${l.href})`),
      ];
      return lines.join("\n");
    }
    case "markdown":
    default:
      // Prefer fit_markdown (main content) when available and requested
      if (typeof result.markdown === "object" && result.markdown !== null) {
        const md = result.markdown as MarkdownGenerationResult;
        if (options?.preferFitMarkdown !== false && md.fit_markdown?.trim()) {
          return md.fit_markdown;
        }
        return md.raw_markdown || "*No markdown content*";
      }
      return result.markdown || "*No markdown content*";
  }
}

/**
 * Metadata saved alongside crawl results.
 */
export interface CrawlManifestPage {
  url: string;
  file: string;
  outlineFile?: string;
  metaFile?: string;
  title?: string;
  charCount?: number;
  headingCount?: number;
  success: boolean;
}

export interface CrawlManifest {
  /** ISO timestamp when crawl was performed */
  timestamp: string;
  /** Number of pages crawled */
  totalPages: number;
  /** Output format used */
  format: CrawlFormat;
  /** Original URLs requested */
  urls: string[];
  /** Deep crawl config if used */
  deepCrawl?: {
    maxDepth: number;
    maxPages?: number;
  };
  /** List of saved content files (relative paths) */
  files: string[];
  /** Per-page metadata for progressive reads */
  pages?: CrawlManifestPage[];
}

/**
 * Create a session directory name from domain and timestamp.
 * Format: {domain}-{ISO-timestamp}
 */
export function createSessionDirName(startUrl: string, timestamp: Date): string {
  let domain: string;
  try {
    domain = new URL(startUrl).hostname;
  } catch {
    domain = "unknown";
  }
  
  // Format timestamp as YYYY-MM-DDTHHMMSS (filesystem-safe ISO-ish)
  const ts = timestamp.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  
  return `${domain}-${ts}`;
}

/**
 * Save crawl results to disk.
 * 
 * Creates a directory structure:
 * ```
 * outputDir/
 *   └── {domain}-{timestamp}/
 *       ├── crawl-manifest.json
 *       └── {domain}/
 *           └── {path}.md
 * ```
 * 
 * @returns Path to the session directory, or null if save is disabled
 */
export interface SaveCrawlOptions {
  preferFitMarkdown?: boolean;
  /** When set and enabled, prune old sessions under outputDir after save. */
  retention?: RetentionPolicy;
}

export interface SaveCrawlResult {
  sessionDir: string;
  cleanup?: CleanupResult;
}

export function saveCrawlResults(
  outputDir: string,
  urls: string[],
  results: CrawlResult[],
  format: CrawlFormat,
  deepCrawl?: { maxDepth: number; maxPages?: number },
  options?: SaveCrawlOptions
): string {
  return saveCrawlResultsDetailed(
    outputDir,
    urls,
    results,
    format,
    deepCrawl,
    options
  ).sessionDir;
}

/**
 * Save crawl results and optionally run retention cleanup.
 * Returns session path plus cleanup stats when retention ran.
 */
export function saveCrawlResultsDetailed(
  outputDir: string,
  urls: string[],
  results: CrawlResult[],
  format: CrawlFormat,
  deepCrawl?: { maxDepth: number; maxPages?: number },
  options?: SaveCrawlOptions
): SaveCrawlResult {
  const timestamp = new Date();
  const sessionDirName = createSessionDirName(urls[0], timestamp);
  const sessionDir = join(outputDir, sessionDirName);
  
  // Create session directory
  mkdirSync(sessionDir, { recursive: true });
  
  const savedFiles: string[] = [];
  const pages: CrawlManifestPage[] = [];
  const savedAt = timestamp.toISOString();
  
  // Save each result (+ outline/meta sidecars for markdown)
  for (const result of results) {
    const relativePath = urlToFilePath(result.url, format);
    const fullPath = join(sessionDir, relativePath);
    
    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    mkdirSync(parentDir, { recursive: true });
    
    // Write content (prefer fit markdown when available)
    const content = formatContentForSave(result, format, {
      preferFitMarkdown: options?.preferFitMarkdown !== false,
    });
    writeFileSync(fullPath, content, "utf-8");
    savedFiles.push(relativePath);

    const pageEntry: CrawlManifestPage = {
      url: result.url,
      file: relativePath,
      success: result.success,
      title: result.metadata?.title,
      charCount: content.length,
    };

    // Sidecars only for markdown-like saved content
    if (format === "markdown" || format === "links" || relativePath.endsWith(".md")) {
      const outlineRelative = relativePath.replace(/\.md$/i, ".outline.md");
      const metaRelative = relativePath.replace(/\.md$/i, ".meta.json");
      const outlinePath = join(sessionDir, outlineRelative);
      const metaPath = join(sessionDir, metaRelative);
      mkdirSync(dirname(outlinePath), { recursive: true });

      const meta = buildPageMeta({
        url: result.url,
        title: result.metadata?.title,
        content,
        savedAt,
      });
      const outline = buildOutlineMarkdown({
        url: result.url,
        title: meta.title,
        content,
      });
      writeFileSync(outlinePath, outline, "utf-8");
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

      pageEntry.outlineFile = outlineRelative;
      pageEntry.metaFile = metaRelative;
      pageEntry.title = meta.title;
      pageEntry.headingCount = meta.headings.length;
    }

    pages.push(pageEntry);
  }
  
  // Create manifest
  const manifest: CrawlManifest = {
    timestamp: savedAt,
    totalPages: results.length,
    format,
    urls,
    files: savedFiles,
    pages,
  };
  
  if (deepCrawl) {
    manifest.deepCrawl = {
      maxDepth: deepCrawl.maxDepth,
      maxPages: deepCrawl.maxPages,
    };
  }
  
  const manifestPath = join(sessionDir, "crawl-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  let cleanup: CleanupResult | undefined;
  // Only run when caller passes retention (crawl tool always does from config).
  // Tests that only save fixtures can omit it to avoid policy side effects.
  if (options?.retention?.enabled) {
    cleanup = cleanupCrawlSessions(outputDir, options.retention);
  }
  
  return { sessionDir, cleanup };
}
