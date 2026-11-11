import type {
  AmazonDataUsage,
  AmazonListingItem,
  AmazonListingResponse,
  AmazonProductResponse,
  AmazonResultEnvelope,
} from "./amazon-types.js";

/** Model-visible text stays bounded; structured output keeps every record. */
const TEXT_CAP = 12000;
const LABEL_RESERVE = 480;
const LISTING_PREVIEW = 25;
const BULLET_PREVIEW = 5;
const BULLET_CHARS = 300;
const RANK_PREVIEW = 3;

const clip = (value: string, cap: number) =>
  value.length > cap ? `${value.slice(0, cap)}… [text shortened]` : value;

const count = (value: number | null) =>
  value === null ? "unknown" : String(value);

/** Per-call transfer accounting; cached responses cost no upstream request. */
function transfer(usage: AmazonDataUsage, cached: boolean): string {
  if (cached)
    return "served from cache: zero upstream requests, zero wire bytes for this call";
  const wire = usage.wire_estimated
    ? `~${usage.wire_bytes} wire bytes (gzip estimate)`
    : `${usage.wire_bytes} wire bytes`;
  return [
    wire,
    `${usage.decoded_bytes} decoded bytes`,
    `${usage.requests} request${usage.requests === 1 ? "" : "s"}`,
    usage.wire_incomplete
      ? "wire bytes incomplete for dispatched attempts"
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function price(item: {
  price: string | null;
  price_amount: number | null;
  currency: string | null;
}): string {
  if (item.price !== null) return item.price;
  if (item.price_amount === null) return "price not shown";
  return `${item.price_amount.toFixed(2)} ${item.currency ?? ""}`.trim();
}

function rating(item: {
  rating: number | null;
  review_count: number | null;
}): string {
  if (item.rating === null)
    return item.review_count === null
      ? "no rating or reviews shown"
      : `rating not shown · ${item.review_count} reviews`;
  return `${item.rating}/5 (${count(item.review_count)} reviews)`;
}

function itemLines(item: AmazonListingItem, index: number): string[] {
  const facts = [
    price(item),
    rating(item),
    item.brand === null
      ? item.source === "new_releases"
        ? "brand: none on New Releases (no byline)"
        : "brand not shown"
      : `brand ${item.brand}`,
    item.rank_position === null ? "" : `rank #${item.rank_position}`,
    item.node === null ? "" : `node ${item.node}`,
    item.badge === null ? "" : `badge ${item.badge}`,
    item.sponsored === true ? "sponsored" : "",
  ].filter(Boolean);
  return [
    `${index + 1}. ${item.asin} · ${clip(item.title, 180)}`,
    `   ${facts.join(" · ")}`,
    `   ${item.product_url}`,
  ];
}

function fit(text: string, labels: string[]): string {
  let result = text;
  for (const label of labels)
    if (label && result.length + label.length + 1 <= TEXT_CAP)
      result += "\n" + label;
  if (result.length > TEXT_CAP)
    result = `${result.slice(0, TEXT_CAP - LABEL_RESERVE - 1)}… [text shortened]`;
  return result;
}

/**
 * New Releases and newest search are listings, not launch evidence: New
 * Releases has no byline or date, and search order churns between sweeps.
 */
export function formatAmazonListing(result: AmazonListingResponse): {
  text: string;
  summary: string;
  details: AmazonResultEnvelope<AmazonListingResponse>;
} {
  const releases = result.source === "new_releases";
  const selector = releases
    ? `node ${result.node ?? "root"}`
    : `"${result.keyword ?? ""}"${result.node === null ? "" : ` in node ${result.node}`}`;
  const summary =
    `${releases ? "Amazon New Releases" : "Amazon newest-sorted search"} · ` +
    `${selector} · page ${result.page} · ${result.item_count} items` +
    `${result.cached ? " · cached" : ""}`;
  const lines = [
    summary,
    `Fetched: ${result.fetched_at} · ${transfer(result.usage, result.cached)}`,
  ];
  if (result.items.length === 0)
    lines.push(
      "No items on this page. An out-of-range page is an empty listing, not an error, and an empty page is not proof that a category has no new items.",
    );
  else lines.push("Items:");
  const preview = result.items.slice(0, LISTING_PREVIEW);
  for (const [index, item] of preview.entries())
    lines.push(...itemLines(item, index));
  const labels = [
    releases
      ? "Amazon New Releases has no byline or date: brand is usually absent and this listing never carries a launch date, so it cannot date a launch by itself. Page 1-5 of one provider page; diff successive sweeps to find new ASINs."
      : "Newest-sorted search is discovery only, not a launch signal: its order churns between sweeps and the returned rows are one bounded provider page (page 1-5). Use New Releases for sweep diffs.",
    "Rank, price and rating are provider-reported snapshots and may be missing or stale.",
    "This client makes exactly one request per call and never retries, waits or probes health; usage is per call, so sum it across calls.",
    preview.length < result.items.length
      ? `Text previews shortened: showing ${preview.length}/${result.items.length} items; structured output keeps every returned record.`
      : "Structured output keeps every returned record and any additive server fields.",
  ];
  return {
    text: fit(lines.join("\n"), labels),
    summary,
    details: { status: "ok", response: result },
  };
}

/** A PDP read: variation collapse and launch dating are caller responsibilities. */
export function formatAmazonProduct(result: AmazonProductResponse): {
  text: string;
  summary: string;
  details: AmazonResultEnvelope<AmazonProductResponse>;
} {
  const product = result.product;
  const summary =
    `Amazon product ${product.asin} · ${clip(product.title, 120)}` +
    `${result.cached ? " · cached" : ""}`;
  const lines = [
    summary,
    `Title: ${clip(product.title, 300)}`,
    `Brand: ${product.brand ?? "not shown"} · Manufacturer: ${product.manufacturer ?? "not shown"}`,
    `Seller: ${product.seller_name ?? "not shown"}${product.sold_by_amazon === true ? " (sold by Amazon)" : ""}`,
    `Price: ${price(product)} · rating ${rating(product)}`,
    `Date first available: ${product.date_first_available ?? "not shown"} · release date: ${product.release_date ?? "not shown"}`,
    `Variation: parent ${product.variation_parent_asin ?? "none"} · count ${count(product.variation_count)}`,
    `Category: ${product.category_path.length === 0 ? "not shown" : product.category_path.join(" > ")}`,
  ];
  if (product.best_sellers_rank.length === 0)
    lines.push("Best sellers rank: not shown");
  else
    lines.push(
      `Best sellers rank: ${product.best_sellers_rank
        .slice(0, RANK_PREVIEW)
        .map((entry) => `#${entry.rank} in ${entry.category}`)
        .join(
          " · ",
        )}${product.best_sellers_rank.length > RANK_PREVIEW ? ` · +${product.best_sellers_rank.length - RANK_PREVIEW} more in structured details` : ""}`,
    );
  lines.push(
    `Bullets: ${product.bullet_points.length === 0 ? "none returned" : ""}`.trim(),
  );
  for (const bullet of product.bullet_points.slice(0, BULLET_PREVIEW))
    lines.push(`- ${clip(bullet, BULLET_CHARS)}`);
  if (product.bullet_points.length > BULLET_PREVIEW)
    lines.push(
      `Text preview shortened: showing ${BULLET_PREVIEW}/${product.bullet_points.length} bullet points; structured output keeps every bullet.`,
    );
  lines.push(
    `Signals: brand store ${product.has_brand_store === true ? "yes" : "no"}, video ${product.has_video === true ? "yes" : "no"}, subscription ${product.subscription_available === true ? "yes" : "no"}`,
    `URL: ${product.product_url}`,
    `Fetched: ${product.fetched_at} · ${transfer(result.usage, result.cached)}`,
    `Warnings: ${product.warnings.length === 0 ? "none" : product.warnings.join(", ")}`,
  );
  const labels = [
    "date_first_available is sparse provider evidence: brand-new ASINs usually omit it, so a launch date must come from first-seen sweep diffs, never from this field alone.",
    "One product page read; this client never retries, never fetches variation children and never calls the provider directly.",
    "Text previews are bounded; structured output keeps every bullet, rank, warning and additive server field.",
  ];
  return {
    text: fit(lines.join("\n"), labels),
    summary,
    details: { status: "ok", response: result },
  };
}
