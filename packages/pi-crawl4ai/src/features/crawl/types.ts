import type { AcquisitionOptions } from "./crawlCapabilities";
/**
 * Types for the crawl feature.
 */

/**
 * Output format for crawl results.
 */
export type CrawlFormat = "markdown" | "html" | "links" | "text";

/**
 * How crawl bodies are returned to the model.
 * - auto: complete files with compact references (inline only for save=false)
 * - inline: bounded preview, still saved unless save=false
 * - files: complete files and compact references (requires saving)
 */
export type ReturnMode = "auto" | "inline" | "files";

/**
 * Deep crawl strategy type.
 */
export type DeepCrawlStrategyType = "bfs" | "dfs" | "best-first";

/**
 * Deep crawl configuration.
 */
export interface DeepCrawlConfig {
  /** Crawl strategy: bfs (breadth-first), dfs (depth-first), best-first */
  strategy?: DeepCrawlStrategyType;
  /** Maximum depth from start URL (1 = only start page, 2 = start + links, etc.) */
  maxDepth: number;
  /** Maximum total pages to crawl (prevents runaway crawls) */
  maxPages?: number;
  /** Follow external links (links to other domains) */
  includeExternal?: boolean;
  /** URL patterns to include (glob patterns) */
  includePatterns?: string[];
  /** URL patterns to exclude (glob patterns) */
  excludePatterns?: string[];
  /** Only crawl these domains */
  allowedDomains?: string[];
  /** Score threshold for best-first strategy (0.0-1.0) */
  scoreThreshold?: number;
}

/**
 * Parameters for the crawl tool.
 */
export interface CrawlToolParams extends AcquisitionOptions {
  bm25Query?: string;
  bm25Threshold?: number;
  includeLinks?: boolean;
  /** URLs to crawl (single or multiple) */
  urls: string[];
  /** Output format (default: markdown) */
  format?: CrawlFormat;
  /** Wait time in milliseconds before extracting content */
  waitFor?: number;
  /** Custom JavaScript to execute before extraction */
  jsCode?: string;
  /** Whether to bypass cache */
  bypassCache?: boolean;
  /** Deep crawl configuration - enables multi-page crawling */
  deepCrawl?: DeepCrawlConfig;
  /**
   * Save results to disk.
   * - undefined: save complete results to the configured default root
   * - false: never save (including files mode)
   * - true: save to default directory (./output-crawl4ai or CRAWL4AI_OUTPUT_DIR)
   * - string: save to custom directory path
   */
  save?: boolean | string;
  /**
   * Control how page bodies are returned to the model.
   * Default: auto (files/index; inline when save=false).
   */
  returnMode?: ReturnMode;
  /** Override max characters of body content per page in the tool result. */
  maxCharsPerPage?: number;
  /** Override max total body characters returned for this crawl call. */
  maxCharsPerCall?: number;
  /** Prefer crawl4ai fit_markdown (main content) over raw_markdown. Default true. */
  preferFitMarkdown?: boolean;
}

/**
 * Markdown generation result from crawl4ai.
 * Contains multiple markdown variants with different processing applied.
 */
export interface MarkdownGenerationResult {
  /** Raw markdown conversion from HTML */
  raw_markdown: string;
  /** Markdown with link citations (e.g., "text⟨1⟩" with references at bottom) */
  markdown_with_citations: string;
  /** References section for cited links */
  references_markdown: string;
  /** Filtered/fit markdown (main content only, when content filter is applied) */
  fit_markdown?: string;
  /** HTML that was used to generate fit_markdown */
  fit_html?: string;
}

/**
 * Result from a single URL crawl.
 */
export interface CrawlResult {
  evidence?: import("./evidence").PageEvidence;
  /** Upstream cache write time: Unix seconds or a service timestamp. */
  cached_at?: number | string | null;
  cache_status?: "hit" | "miss" | "bypass" | "unknown";
  media?: Record<string, unknown>;
  tables?: unknown[];
  /** The URL that was crawled */
  url: string;
  /** Whether the crawl was successful */
  success: boolean;
  /** Markdown content - either a string or detailed MarkdownGenerationResult object */
  markdown?: string | MarkdownGenerationResult;
  /** HTML content (if format was html) */
  html?: string;
  /** Extracted links */
  links?: {
    internal: Array<{ href: string; text: string }>;
    external: Array<{ href: string; text: string }>;
  };
  extraction_error?: { category: string; code: string; message: string; retryable?: boolean };
  /** Server-owned per-item diagnostics from capability routes. */
  error?: { category: string; code: string; message: string; retryable: boolean; phase?: import("./http").CrawlPhase; operationOutcome?: string };
  /** Error message if crawl failed */
  error_message?: string;
  /** HTTP status code */
  status_code?: number;
  /** Response headers */
  response_headers?: Record<string, string>;
  /** Metadata extracted from the page */
  document?: { originalBase64: string; sha256: string; pages: Array<{ pageNumber: number; text: string }>; metadata?: Record<string, unknown>; limitations?: string[] };
  interaction?: { before?: { url?: string; html: string; metadata?: { snapshotId?: string; statusCode?: number | null; contentType?: string | null; [key: string]: unknown } }; after?: { url?: string; html: string; metadata?: Record<string, unknown> }; actions?: import("./crawlCapabilities").CrawlAction[]; results?: unknown[]; scriptHashes?: string[]; outcome: string };
  redirected_url?: string;
  selected_html?: string;
  extracted_content?: unknown;
  metadata?: {
    [key: string]: unknown;
    acquisitionId?: string;
    snapshotId?: string;
    observedAt?: string;
    cacheStatus?: "hit" | "miss" | "bypass" | "unknown";
    callerScriptInfluenced?: boolean;
    verifiedRedirects?: Array<{ from: string; to: string }>;
    title?: string;
    description?: string;
    keywords?: string[];
    author?: string;
    /** Depth from start URL (deep crawl only) */
    depth?: number;
    /** Parent URL (deep crawl only) */
    parent_url?: string;
  };
}

/**
 * Response from the crawl4ai API.
 */
export interface Crawl4AIResponse {
  success: boolean;
  results: CrawlResult[];
}
