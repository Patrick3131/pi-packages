import { AmazonClientError } from "./amazon-errors.js";
import {
  AMAZON_ASIN,
  AMAZON_DEFAULT_TIMEOUT_MS,
  AMAZON_KEYWORD,
  AMAZON_MAX_ARRAY_FIELDS,
  AMAZON_MAX_LISTING_ITEMS,
  AMAZON_MAX_PAGE,
  AMAZON_MAX_TIMEOUT_MS,
  AMAZON_MAX_TITLE_LENGTH,
  AMAZON_MAX_URL_LENGTH,
  AMAZON_MIN_PAGE,
  AMAZON_MIN_TIMEOUT_MS,
  AMAZON_PROVIDER_DATE,
  AMAZON_PRODUCT_URL_PREFIX,
  AMAZON_SCHEMA_VERSION,
  AMAZON_SEARCH_NODE,
  AMAZON_SELECTOR_NODE,
  AMAZON_SORTS,
  AMAZON_TIMESTAMP,
  type AmazonBestSellerRank,
  type AmazonDataUsage,
  type AmazonListingItem,
  type AmazonListingResponse,
  type AmazonListingSource,
  type AmazonNewReleasesParams,
  type AmazonProductDetail,
  type AmazonProductParams,
  type AmazonProductResponse,
  type AmazonSearchParams,
  type AmazonSort,
} from "./amazon-types.js";

/** One validated wire request: route, exact body and effective server budget. */
export interface AmazonRequest {
  endpoint: string;
  body: Record<string, unknown>;
  serverTimeoutMs: number;
}

/** A listing request also carries the values the response must echo. */
export interface AmazonListingRequest extends AmazonRequest {
  source: AmazonListingSource;
  page: number;
}

/** A product request also carries the canonical ASIN the response must echo. */
export interface AmazonProductRequest extends AmazonRequest {
  asin: string;
}

const invalid = (): never => {
  throw new AmazonClientError("invalid_request");
};
const malformed = (): never => {
  throw new AmazonClientError("malformed");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isNullableText = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
const isNullableBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === "boolean";

function rejectUnknown(params: object, allowed: readonly string[]): void {
  if (Object.keys(params).some((key) => !allowed.includes(key))) invalid();
}

function timeout(raw: unknown): number {
  if (raw === undefined) return AMAZON_DEFAULT_TIMEOUT_MS;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < AMAZON_MIN_TIMEOUT_MS ||
    raw > AMAZON_MAX_TIMEOUT_MS
  )
    return invalid();
  return raw;
}

function page(raw: unknown): number {
  if (raw === undefined) return AMAZON_MIN_PAGE;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < AMAZON_MIN_PAGE ||
    raw > AMAZON_MAX_PAGE
  )
    return invalid();
  return raw;
}

function node(raw: unknown, pattern: RegExp): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!pattern.test(value)) return invalid();
  return value;
}

function keyword(raw: unknown): string {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!AMAZON_KEYWORD.test(value)) return invalid();
  return value;
}

function sort(raw: unknown): AmazonSort {
  if (raw === undefined) return "newest";
  if (!AMAZON_SORTS.includes(raw as AmazonSort)) return invalid();
  return raw as AmazonSort;
}

/** Canonicalize uppercase; anything that is not a 10-character ASIN is rejected. */
export function canonicalAsin(raw: unknown): string {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim().toUpperCase();
  if (!AMAZON_ASIN.test(value)) return invalid();
  return value;
}

export function amazonNewReleasesRequest(
  params: AmazonNewReleasesParams,
): AmazonListingRequest {
  rejectUnknown(params, ["node", "page", "timeout_ms"]);
  const selector = node(params.node, AMAZON_SELECTOR_NODE);
  const effectiveTimeout = timeout(params.timeout_ms);
  const body: Record<string, unknown> = {};
  if (selector !== undefined) body.node = selector;
  const effectivePage = page(params.page);
  body.page = effectivePage;
  body.timeout_ms = effectiveTimeout;
  return {
    endpoint: "/v1/amazon/new-releases",
    body,
    serverTimeoutMs: effectiveTimeout,
    source: "new_releases",
    page: effectivePage,
  };
}

export function amazonSearchRequest(
  params: AmazonSearchParams,
): AmazonListingRequest {
  rejectUnknown(params, ["keyword", "node", "page", "sort", "timeout_ms"]);
  const effectiveTimeout = timeout(params.timeout_ms);
  const body: Record<string, unknown> = { keyword: keyword(params.keyword) };
  const selector = node(params.node, AMAZON_SEARCH_NODE);
  if (selector !== undefined) body.node = selector;
  const effectivePage = page(params.page);
  body.page = effectivePage;
  body.sort = sort(params.sort);
  body.timeout_ms = effectiveTimeout;
  return {
    endpoint: "/v1/amazon/search",
    body,
    serverTimeoutMs: effectiveTimeout,
    source: "search",
    page: effectivePage,
  };
}

export function amazonProductRequest(
  params: AmazonProductParams,
): AmazonProductRequest {
  rejectUnknown(params, ["asin", "timeout_ms"]);
  const asin = canonicalAsin(params.asin);
  const effectiveTimeout = timeout(params.timeout_ms);
  return {
    endpoint: "/v1/amazon/product",
    body: { asin, timeout_ms: effectiveTimeout },
    serverTimeoutMs: effectiveTimeout,
    asin,
  };
}

const isUsage = (value: unknown): value is AmazonDataUsage =>
  isRecord(value) &&
  isCount(value.decoded_bytes) &&
  isCount(value.wire_bytes) &&
  typeof value.wire_estimated === "boolean" &&
  isCount(value.requests) &&
  (value.wire_incomplete === undefined ||
    typeof value.wire_incomplete === "boolean");

function parseUsage(value: unknown): AmazonDataUsage {
  if (!isUsage(value)) return malformed();
  return value;
}

/** Error envelopes may omit usage; a malformed one never masks the real error. */
export function optionalAmazonUsage(
  value: unknown,
): AmazonDataUsage | undefined {
  return isUsage(value) ? value : undefined;
}

function productUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > AMAZON_MAX_URL_LENGTH ||
    !value.startsWith(AMAZON_PRODUCT_URL_PREFIX)
  )
    return malformed();
  return value;
}

function nullableUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > AMAZON_MAX_URL_LENGTH)
    return malformed();
  return value;
}

function title(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > AMAZON_MAX_TITLE_LENGTH
  )
    return malformed();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !AMAZON_TIMESTAMP.test(value))
    return malformed();
  return value;
}

function parseListingItem(value: unknown): AmazonListingItem {
  if (
    !isRecord(value) ||
    typeof value.asin !== "string" ||
    !AMAZON_ASIN.test(value.asin) ||
    !isNullableText(value.brand) ||
    !isNullableText(value.price) ||
    !(value.price_amount === null || isAmount(value.price_amount)) ||
    !isNullableText(value.currency) ||
    !(value.rating === null || (isAmount(value.rating) && value.rating <= 5)) ||
    !(value.review_count === null || isCount(value.review_count)) ||
    !(
      value.rank_position === null ||
      (isCount(value.rank_position) && value.rank_position >= 1)
    ) ||
    !isNullableText(value.badge) ||
    !isNullableBoolean(value.sponsored) ||
    !isNullableText(value.node) ||
    !["new_releases", "search"].includes(String(value.source))
  )
    return malformed();
  title(value.title);
  nullableUrl(value.image_url);
  productUrl(value.product_url);
  return value as unknown as AmazonListingItem;
}

export function parseAmazonListingResponse(
  data: unknown,
  request: Pick<AmazonListingRequest, "source" | "page">,
): AmazonListingResponse {
  if (
    !isRecord(data) ||
    data.schema_version !== AMAZON_SCHEMA_VERSION ||
    data.source !== request.source ||
    !isCount(data.page) ||
    data.page !== request.page ||
    !isNullableText(data.node) ||
    !isNullableText(data.keyword) ||
    !isCount(data.item_count) ||
    !Array.isArray(data.items) ||
    data.items.length > AMAZON_MAX_LISTING_ITEMS ||
    data.item_count !== data.items.length ||
    typeof data.cached !== "boolean"
  )
    return malformed();
  timestamp(data.fetched_at);
  parseUsage(data.usage);
  if (request.source === "search" && data.keyword === null) return malformed();
  const items = data.items.map(parseListingItem);
  if (new Set(items.map((item) => item.asin)).size !== items.length)
    return malformed();
  if (items.some((item) => item.source !== request.source)) return malformed();
  return { ...data, items } as AmazonListingResponse;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= AMAZON_MAX_ARRAY_FIELDS &&
  value.every((entry) => typeof entry === "string" && entry.length <= 4000);

const isRankArray = (value: unknown): value is AmazonBestSellerRank[] =>
  Array.isArray(value) &&
  value.length <= AMAZON_MAX_ARRAY_FIELDS &&
  value.every(
    (entry) =>
      isRecord(entry) &&
      isCount(entry.rank) &&
      entry.rank >= 1 &&
      typeof entry.category === "string" &&
      entry.category.length <= 120,
  );

function parseProduct(value: unknown): AmazonProductDetail {
  if (
    !isRecord(value) ||
    typeof value.asin !== "string" ||
    !AMAZON_ASIN.test(value.asin) ||
    !isNullableText(value.brand) ||
    !isNullableText(value.manufacturer) ||
    !isNullableText(value.seller_name) ||
    !isNullableBoolean(value.sold_by_amazon) ||
    !isNullableText(value.price) ||
    !(value.price_amount === null || isAmount(value.price_amount)) ||
    !isNullableText(value.currency) ||
    !(value.rating === null || (isAmount(value.rating) && value.rating <= 5)) ||
    !(value.review_count === null || isCount(value.review_count)) ||
    !(
      value.date_first_available === null ||
      (typeof value.date_first_available === "string" &&
        AMAZON_PROVIDER_DATE.test(value.date_first_available))
    ) ||
    !(
      value.release_date === null ||
      (typeof value.release_date === "string" &&
        AMAZON_PROVIDER_DATE.test(value.release_date))
    ) ||
    !(
      value.variation_parent_asin === null ||
      (typeof value.variation_parent_asin === "string" &&
        AMAZON_ASIN.test(value.variation_parent_asin))
    ) ||
    !(
      value.variation_count === null ||
      (isCount(value.variation_count) && value.variation_count >= 1)
    ) ||
    !isStringArray(value.category_path) ||
    !isRankArray(value.best_sellers_rank) ||
    !isStringArray(value.bullet_points) ||
    !isNullableBoolean(value.has_brand_store) ||
    !isNullableBoolean(value.has_video) ||
    !isNullableBoolean(value.subscription_available) ||
    !isNullableText(value.image_url) ||
    !Array.isArray(value.warnings) ||
    value.warnings.length > AMAZON_MAX_ARRAY_FIELDS ||
    !value.warnings.every(
      (warning) =>
        typeof warning === "string" && /^[a-z][a-z0-9_]{0,47}$/.test(warning),
    ) ||
    value.source !== "pdp"
  )
    return malformed();
  title(value.title);
  timestamp(value.fetched_at);
  nullableUrl(value.image_url);
  productUrl(value.product_url);
  return value as unknown as AmazonProductDetail;
}

export function parseAmazonProductResponse(
  data: unknown,
  asin?: string,
): AmazonProductResponse {
  if (
    !isRecord(data) ||
    data.schema_version !== AMAZON_SCHEMA_VERSION ||
    !isRecord(data.product) ||
    typeof data.cached !== "boolean"
  )
    return malformed();
  parseUsage(data.usage);
  const product = parseProduct(data.product);
  if (asin !== undefined && product.asin !== asin) return malformed();
  return { ...data, product } as AmazonProductResponse;
}
