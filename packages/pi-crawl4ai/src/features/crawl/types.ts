/**
 * Types for the crawl feature.
 */

/**
 * Output format for crawl results.
 */
export type CrawlFormat = "markdown" | "html" | "links";

/**
 * Deep crawl strategy type.
 */
export type DeepCrawlStrategyType = "bfs" | "dfs" | "best-first";

/**
 * URL filter configuration for deep crawling.
 */
export interface URLFilterConfig {
  /** URL patterns to include (glob patterns like "/docs/*", "*.html") */
  includePatterns?: string[];
  /** URL patterns to exclude */
  excludePatterns?: string[];
  /** Only crawl these domains (for cross-domain crawling) */
  allowedDomains?: string[];
  /** Content types to allow (e.g., ["text/html"]) */
  allowedContentTypes?: string[];
}

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
export interface CrawlToolParams {
  /** URLs to crawl (single or multiple) */
  urls: string[];
  /** Optional site hint for auth profile selection (e.g. x, twitter, reddit) */
  site?: string;
  /** Explicit auth profile name to use for this crawl */
  authProfile?: string;
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
   * - undefined/false: don't save (default)
   * - true: save to default directory (./output-crawl4ai or CRAWL4AI_OUTPUT_DIR)
   * - string: save to custom directory path
   */
  save?: boolean | string;
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
  /** Error message if crawl failed */
  error_message?: string;
  /** HTTP status code */
  status_code?: number;
  /** Response headers */
  response_headers?: Record<string, string>;
  /** Metadata extracted from the page */
  metadata?: {
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
