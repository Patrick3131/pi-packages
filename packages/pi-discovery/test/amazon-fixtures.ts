import type {
  AmazonDataUsage,
  AmazonListingItem,
  AmazonListingResponse,
  AmazonProductResponse,
} from "../src/amazon-types.js";

export const usage: AmazonDataUsage = {
  decoded_bytes: 241000,
  wire_bytes: 119000,
  wire_estimated: true,
  requests: 1,
};

export const cachedUsage: AmazonDataUsage = {
  decoded_bytes: 0,
  wire_bytes: 0,
  wire_estimated: false,
  requests: 0,
};

const newReleaseItem: AmazonListingItem = {
  asin: "B0HQZCTBPW",
  title: "Baby Stroller Lightweight Travel System",
  brand: null,
  price: "$249.99",
  price_amount: 249.99,
  currency: "USD",
  rating: 4.6,
  review_count: 812,
  rank_position: 3,
  badge: "New Release",
  sponsored: false,
  image_url: "https://m.media-amazon.com/images/I/example.jpg",
  product_url: "https://www.amazon.com/dp/B0HQZCTBPW?th=1&psc=1",
  node: "baby-products",
  source: "new_releases",
  fetched_at: "2026-11-11T10:05:00.123456Z",
};

const searchItem: AmazonListingItem = {
  asin: "B0SEARCH01",
  title: "Stroller Organizer with Cup Holder",
  brand: "ExampleBrand",
  price: "$24.99",
  price_amount: 24.99,
  currency: "USD",
  rating: 4.2,
  review_count: 143,
  rank_position: 1,
  badge: null,
  sponsored: true,
  image_url: null,
  product_url: "https://www.amazon.com/dp/B0SEARCH01?th=1&psc=1",
  node: "166764011",
  source: "search",
  fetched_at: "2026-11-11T10:06:00Z",
};

export const newReleasesResponse: AmazonListingResponse = {
  schema_version: "amazon.v1",
  source: "new_releases",
  node: "baby-products",
  keyword: null,
  page: 1,
  item_count: 2,
  items: [
    newReleaseItem,
    { ...newReleaseItem, asin: "B0SECOND01", title: "Second new ASIN" },
  ],
  fetched_at: "2026-11-11T10:05:00Z",
  cached: false,
  usage,
};

export const searchResponse: AmazonListingResponse = {
  schema_version: "amazon.v1",
  source: "search",
  node: null,
  keyword: "baby stroller",
  page: 1,
  item_count: 1,
  items: [searchItem],
  fetched_at: "2026-11-11T10:06:00Z",
  cached: false,
  usage,
};

export const cachedNewReleasesResponse: AmazonListingResponse = {
  ...newReleasesResponse,
  cached: true,
  usage: cachedUsage,
};

export const productResponse: AmazonProductResponse = {
  schema_version: "amazon.v1",
  cached: false,
  usage,
  product: {
    asin: "B0HQZCTBPW",
    title: "Baby Stroller Lightweight Travel System",
    brand: "ExampleBaby",
    manufacturer: "ExampleBaby Inc.",
    seller_name: "ExampleBaby Official",
    sold_by_amazon: false,
    price: "$249.99",
    price_amount: 249.99,
    currency: "USD",
    rating: 4.6,
    review_count: 812,
    date_first_available: "2026-09-14",
    release_date: null,
    variation_parent_asin: "B0HQZCTBPW",
    variation_count: 4,
    category_path: ["Baby", "Strollers"],
    best_sellers_rank: [{ rank: 912, category: "Baby Strollers" }],
    bullet_points: ["Lightweight frame", "One-hand fold"],
    has_brand_store: true,
    has_video: false,
    subscription_available: false,
    image_url: "https://m.media-amazon.com/images/I/example.jpg",
    product_url: "https://www.amazon.com/dp/B0HQZCTBPW?th=1&psc=1",
    source: "pdp",
    fetched_at: "2026-11-11T10:07:00Z",
    warnings: [],
  },
};

export interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
}

/** Deterministic fetch stub that records the exact route and body Pi sent. */
export function recordingFetch(
  payload: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
    text?: string;
  } = {},
): { calls: RecordedCall[]; fetch: typeof fetch } {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(options.text ?? JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: options.headers,
    });
  };
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}
