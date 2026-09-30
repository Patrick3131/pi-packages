/**
 * Save crawl results to disk.
 */

import { mkdirSync, mkdtempSync, writeFileSync, renameSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
import type { CrawlResult, CrawlFormat, DeepCrawlStrategyType, MarkdownGenerationResult } from "./types";
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
 * - undefined → default directory (file-first)
 * - true → use default directory
 * - string → use as custom path
 */
export function resolveOutputDir(
  save: boolean | string | undefined,
  configDefault?: string
): string | null {
  if (save === false) return null;
  if (save === true || save === undefined) {
    return getDefaultOutputDir(configDefault);
  }
  return save;
}

/**
 * A bounded readable slug plus the full-URL SHA-256 identifies queries, ports and protocols.
 */
export function urlToFilePath(url: string, format: CrawlFormat): string {
  const hash = createHash("sha256").update(url).digest("hex");
  let slug = "unknown";
  try {
    const parsed = new URL(url);
    slug = `${parsed.hostname}-${parsed.pathname === "/" ? "index" : parsed.pathname}`;
  } catch { /* Invalid response URLs still get a safe unique filename. */ }
  slug = slug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  const ext = format === "html" ? "html" : format === "text" ? "txt" : "md";
  return `${slug}-${hash}.${ext}`;
}

export function createCrawlSession(outputDir: string, urls: string[]): string {
  mkdirSync(outputDir, { recursive: true });
  return mkdtempSync(join(resolve(outputDir), `${createSessionDirName(urls[0], new Date())}-`));
}

/** Generated and manifest paths must remain inside their real session, including symlinks. */
export function containedArtifactPath(sessionDir: string, file: string): string {
  const root = realpathSync(sessionDir);
  const target = resolve(sessionDir, file);
  const rel = relative(resolve(sessionDir), target);
  if (isAbsolute(file) || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Artifact path escapes session: ${file}`);
  let existing = target;
  while (true) {
    try {
      const real = realpathSync(existing);
      const realRel = relative(root, real);
      if (realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) throw new Error(`Artifact symlink escapes session: ${file}`);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      existing = dirname(existing);
    }
  }
  return target;
}

export function writeCrawlArtifact(sessionDir: string, file: string, content: string): string {
  const path = containedArtifactPath(sessionDir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  return path;
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
      return result.html ?? "";
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
        return md.raw_markdown ?? "";
      }
      return result.markdown ?? "";
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
  sourceFile?: string;
  rawHtmlFile?: string;
  filter?: { query: string; threshold: number; matchedSectionCount: number; totalSections: number };
  extractor?: { name: "trafilatura"; includeLinks: boolean };
  title?: string;
  charCount?: number;
  headingCount?: number;
  success: boolean;
  /** Redacted failure reason for failed pages. */
  error?: string;
}

/**
 * Effective request values that produced a crawl, with defaults already applied.
 * Never contains credentials: `jsCode` is recorded as a boolean only.
 */
export interface CrawlManifestRequest {
  format: CrawlFormat;
  bypassCache: boolean;
  preferFitMarkdown: boolean;
  /** Milliseconds waited after rendering, when requested. */
  waitFor?: number;
  /** True when remote-browser JavaScript ran; the source is never persisted. */
  jsCode?: true;
  deepCrawl?: {
    strategy: DeepCrawlStrategyType;
    /** Link hops from the seed, as recorded in the legacy deepCrawl field. */
    maxDepth: number;
    maxPages: number;
    includeExternal?: boolean;
    includePatterns?: string[];
    excludePatterns?: string[];
    allowedDomains?: string[];
    scoreThreshold?: number;
  };
  bm25?: { query: string; threshold: number };
  extractor?: { name: "trafilatura"; includeLinks: boolean };
}

/** Service endpoint that produced a crawl, without credentials. */
export interface CrawlManifestService {
  baseUrl: string;
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
  /** Effective request values (new manifests) */
  request?: CrawlManifestRequest;
  /** Service endpoint without credentials (new manifests) */
  service?: CrawlManifestService;
  /** List of saved content files (relative paths) */
  files: string[];
  /** Per-page metadata for progressive reads */
  pages: CrawlManifestPage[];
}

/** Strip URL userinfo so a persisted service endpoint never carries credentials. */
export function credentialFreeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]*@/, "$1");
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
  
  return `${domain.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}-${ts}`;
}

/**
 * Save crawl results to disk.
 * 
 * Creates a directory structure:
 * ```
 * outputDir/
 *   └── {domain}-{timestamp}-{exclusive-suffix}/
 *       ├── crawl-manifest.json (published last)
 *       └── {bounded-slug}-{full-url-hash}.md
 * ```
 * 
 * @returns Path to the session directory, or null if save is disabled
 */
export interface SaveCrawlOptions {
  preferFitMarkdown?: boolean;
  sessionDir?: string;
  artifacts?: Array<{ sourceContent?: string; rawHtmlFile?: string; filter?: CrawlManifestPage["filter"]; extractor?: CrawlManifestPage["extractor"] }>;
  /** When set and enabled, prune old sessions under outputDir after save. */
  retention?: RetentionPolicy;
  /** Effective request values recorded in the manifest. */
  request?: CrawlManifestRequest;
  /** Credential-free service endpoint recorded in the manifest. */
  service?: CrawlManifestService;
}

export interface SavedCrawlPage {
  /** Page URL as returned by crawl4ai. */
  url: string;
  /** Path relative to the crawl session directory (also stored in the manifest). */
  file: string;
  /** Exact path to the saved page content. */
  path: string;
  outlineFile?: string;
  metaFile?: string;
  outlinePath?: string;
  metaPath?: string;
  sourceFile?: string;
  sourcePath?: string;
  rawHtmlFile?: string;
  rawHtmlPath?: string;
  filter?: CrawlManifestPage["filter"];
  extractor?: CrawlManifestPage["extractor"];
}

export interface SaveCrawlResult {
  sessionDir: string;
  /** Exact path to the manifest that maps URLs to page files. */
  manifestPath: string;
  /** Exact paths for each saved page, in crawl result order. */
  pagePaths: SavedCrawlPage[];
  cleanup?: CleanupResult;
}

/**
 * Save crawl results and optionally run retention cleanup.
 * Returns the session, manifest, exact page paths, plus cleanup stats when retention ran.
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
  const sessionDir = options?.sessionDir ?? createCrawlSession(outputDir, urls);
  
  const savedFiles: string[] = [];
  const pagePaths: SavedCrawlPage[] = [];
  const pages: CrawlManifestPage[] = [];
  const savedAt = timestamp.toISOString();
  
  // Save each result (+ outline/meta sidecars for markdown)
  for (const [index, result] of results.entries()) {
    const basePath = urlToFilePath(result.url, format);
    const relativePath = savedFiles.includes(basePath) ? `${index}-${basePath}` : basePath;
    const fullPath = containedArtifactPath(sessionDir, relativePath);
    
    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    mkdirSync(parentDir, { recursive: true });
    
    // Write content (prefer fit markdown when available)
    const content = formatContentForSave(result, format, {
      preferFitMarkdown: options?.preferFitMarkdown !== false,
    });
    writeCrawlArtifact(sessionDir, relativePath, content);
    savedFiles.push(relativePath);

    const pageEntry: CrawlManifestPage = {
      url: result.url,
      file: relativePath,
      success: result.success,
      // Failed pages record the reason; callers redact server diagnostics before saving.
      error: result.success ? undefined : result.error_message,
      title: result.metadata?.title,
      charCount: content.length,
    };

    const artifact = options?.artifacts?.[index];
    if (artifact?.sourceContent !== undefined) {
      pageEntry.sourceFile = `${relativePath}.source.${format === "text" ? "txt" : "md"}`;
      writeCrawlArtifact(sessionDir, pageEntry.sourceFile, artifact.sourceContent);
    }
    if (artifact?.rawHtmlFile) {
      containedArtifactPath(sessionDir, artifact.rawHtmlFile);
      pageEntry.rawHtmlFile = artifact.rawHtmlFile;
    }
    pageEntry.filter = artifact?.filter;
    pageEntry.extractor = artifact?.extractor;

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
      writeCrawlArtifact(sessionDir, outlineRelative, outline);
      writeCrawlArtifact(sessionDir, metaRelative, JSON.stringify(meta, null, 2));

      pageEntry.outlineFile = outlineRelative;
      pageEntry.metaFile = metaRelative;
      pageEntry.title = meta.title;
      pageEntry.headingCount = meta.headings.length;
    }

    pages.push(pageEntry);
    pagePaths.push({
      url: result.url,
      file: relativePath,
      path: fullPath,
      sourceFile: pageEntry.sourceFile,
      sourcePath: pageEntry.sourceFile ? join(sessionDir, pageEntry.sourceFile) : undefined,
      rawHtmlFile: pageEntry.rawHtmlFile,
      rawHtmlPath: pageEntry.rawHtmlFile ? join(sessionDir, pageEntry.rawHtmlFile) : undefined,
      filter: pageEntry.filter,
      extractor: pageEntry.extractor,
      outlineFile: pageEntry.outlineFile,
      metaFile: pageEntry.metaFile,
      outlinePath: pageEntry.outlineFile ? join(sessionDir, pageEntry.outlineFile) : undefined,
      metaPath: pageEntry.metaFile ? join(sessionDir, pageEntry.metaFile) : undefined,
    });
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

  if (options?.request) manifest.request = options.request;
  if (options?.service) manifest.service = options.service;
  
  const manifestPath = join(sessionDir, "crawl-manifest.json");
  const pendingManifest = writeCrawlArtifact(sessionDir, ".crawl-manifest.pending", JSON.stringify(manifest, null, 2));
  renameSync(pendingManifest, manifestPath);

  let cleanup: CleanupResult | undefined;
  // Only run when caller passes retention (crawl tool always does from config).
  // Tests that only save fixtures can omit it to avoid policy side effects.
  if (options?.retention?.enabled) {
    cleanup = cleanupCrawlSessions(outputDir, options.retention, { protectedPaths: [sessionDir] });
  }
  
  return {
    sessionDir,
    manifestPath,
    pagePaths,
    cleanup,
  };
}
