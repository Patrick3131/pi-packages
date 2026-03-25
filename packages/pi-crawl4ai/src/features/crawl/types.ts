/**
 * Types for the crawl feature.
 */

/**
 * Output format for crawl results.
 */
export type CrawlFormat = "markdown" | "html" | "links";

/**
 * Parameters for the crawl tool.
 */
export interface CrawlToolParams {
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
}

/**
 * Result from a single URL crawl.
 */
export interface CrawlResult {
  /** The URL that was crawled */
  url: string;
  /** Whether the crawl was successful */
  success: boolean;
  /** Markdown content (if format was markdown) */
  markdown?: string;
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
  };
}

/**
 * Response from the crawl4ai API.
 */
export interface Crawl4AIResponse {
  success: boolean;
  results: CrawlResult[];
}
