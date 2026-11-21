/**
 * Wire contract for the Discovery Amazon routes. Field names stay snake_case so
 * structured output matches the API exactly, and additive server fields survive
 * every parser.
 */

export const AMAZON_SCHEMA_VERSION = "amazon.v1";

export type AmazonSource = "new_releases" | "search" | "pdp";
export type AmazonListingSource = "new_releases" | "search";
export type AmazonSort = "newest" | "relevance";
export type AmazonResultStatus = "ok" | "not_found" | "error";

/** Stable client failure categories exposed by tool envelopes. */
export type AmazonClientCode =
  | "invalid_request"
  | "disabled"
  | "not_found"
  | "queue_full"
  | "blocked"
  | "upstream"
  | "timeout"
  | "transport"
  | "malformed";

/** Sanitized house error codes emitted by the Amazon routes. */
export const AMAZON_SERVER_CODES = new Set([
  "amazon_invalid_request",
  "amazon_disabled",
  "amazon_not_found",
  "amazon_queue_full",
  "amazon_blocked",
  "amazon_upstream",
  "amazon_timeout",
]);

export const AMAZON_NOT_FOUND_CODES = new Set(["amazon_not_found"]);

/** New Releases: department slug or slug/numeric subcategory. */
export const AMAZON_SELECTOR_NODE = /^[A-Za-z0-9_-]{1,64}(?:\/[0-9]{1,12})?$/;
/** Search: numeric browse node or slug/numeric; a bare slug would be ignored. */
export const AMAZON_SEARCH_NODE =
  /^(?:[0-9]{1,12}|[A-Za-z0-9_-]{1,64}\/[0-9]{1,12})$/;
export const AMAZON_ASIN = /^[A-Z0-9]{10}$/;
export const AMAZON_KEYWORD = /^[^\x00-\x1f]{1,120}$/;
export const AMAZON_SORTS = ["newest", "relevance"] as const;

export const AMAZON_MIN_PAGE = 1;
export const AMAZON_MAX_PAGE = 5;
export const AMAZON_MIN_TIMEOUT_MS = 5000;
export const AMAZON_MAX_TIMEOUT_MS = 60000;
export const AMAZON_DEFAULT_TIMEOUT_MS = 30000;
/** One listing page is capped well above the observed 60 items. */
export const AMAZON_MAX_LISTING_ITEMS = 120;
export const AMAZON_MAX_URL_LENGTH = 2048;
export const AMAZON_MAX_TITLE_LENGTH = 2000;
export const AMAZON_MAX_ARRAY_FIELDS = 200;
export const AMAZON_PROVIDER_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const AMAZON_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
export const AMAZON_PRODUCT_URL_PREFIX = "https://www.amazon.com/";

/** HTTP timeout floor for the Amazon routes; 30 s server + 10 s margin. */
export const AMAZON_DEFAULT_HTTP_TIMEOUT_MS = 40000;
/** Client HTTP budget beyond the effective server budget. */
export const AMAZON_HTTP_TIMEOUT_MARGIN_MS = 10000;

/**
 * Per-response transfer accounting so proxy cost is measurable, not guessed.
 * `wire_incomplete` is absent on older servers; newer ones flag dispatched
 * attempts whose wire bytes could only be estimated.
 */
export interface AmazonDataUsage {
  decoded_bytes: number;
  wire_bytes: number;
  wire_estimated: boolean;
  requests: number;
  wire_incomplete?: boolean;
  [key: string]: unknown;
}

export interface AmazonListingItem {
  asin: string;
  title: string;
  brand: string | null;
  price: string | null;
  price_amount: number | null;
  currency: string | null;
  rating: number | null;
  review_count: number | null;
  rank_position: number | null;
  badge: string | null;
  sponsored: boolean | null;
  image_url: string | null;
  product_url: string;
  node: string | null;
  source: AmazonSource;
  fetched_at: string;
  [key: string]: unknown;
}

export interface AmazonListingResponse {
  schema_version: "amazon.v1";
  source: AmazonListingSource;
  node: string | null;
  keyword: string | null;
  page: number;
  item_count: number;
  items: AmazonListingItem[];
  fetched_at: string;
  cached: boolean;
  usage: AmazonDataUsage;
  [key: string]: unknown;
}

export interface AmazonBestSellerRank {
  rank: number;
  category: string;
  [key: string]: unknown;
}

export interface AmazonProductDetail {
  asin: string;
  title: string;
  brand: string | null;
  manufacturer: string | null;
  seller_name: string | null;
  sold_by_amazon: boolean | null;
  price: string | null;
  price_amount: number | null;
  currency: string | null;
  rating: number | null;
  review_count: number | null;
  date_first_available: string | null;
  release_date: string | null;
  variation_parent_asin: string | null;
  variation_count: number | null;
  category_path: string[];
  best_sellers_rank: AmazonBestSellerRank[];
  bullet_points: string[];
  has_brand_store: boolean | null;
  has_video: boolean | null;
  subscription_available: boolean | null;
  image_url: string | null;
  product_url: string;
  source: "pdp";
  fetched_at: string;
  warnings: string[];
  [key: string]: unknown;
}

export interface AmazonProductResponse {
  schema_version: "amazon.v1";
  product: AmazonProductDetail;
  cached: boolean;
  usage: AmazonDataUsage;
  [key: string]: unknown;
}

export interface AmazonNewReleasesParams {
  node?: string;
  page?: number;
  timeout_ms?: number;
}

export interface AmazonSearchParams {
  keyword: string;
  node?: string;
  page?: number;
  sort?: AmazonSort;
  timeout_ms?: number;
}

export interface AmazonProductParams {
  asin: string;
  timeout_ms?: number;
}

export interface AmazonClientOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

/** Typed result envelope shared by `structuredContent` and `details`. */
export interface AmazonResultEnvelope<R> {
  status: AmazonResultStatus;
  requestId?: string;
  response?: R;
  error?: AmazonResultError;
}

export interface AmazonResultError {
  code: string;
  status?: number;
  serverCode?: string;
  requestId?: string;
  retryAfterMs?: number;
  reason?: string;
  usage?: AmazonDataUsage;
}
