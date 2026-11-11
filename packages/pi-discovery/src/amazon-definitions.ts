import { Type, type TSchema } from "typebox";
import {
  AMAZON_MAX_LISTING_ITEMS,
  AMAZON_MAX_PAGE,
  AMAZON_MAX_TIMEOUT_MS,
  AMAZON_MIN_PAGE,
  AMAZON_MIN_TIMEOUT_MS,
  AMAZON_SCHEMA_VERSION,
} from "./amazon-types.js";

const nullableText = Type.Union([Type.String(), Type.Null()]);
const nullableCount = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
const nullableAmount = Type.Union([Type.Number({ minimum: 0 }), Type.Null()]);
const nullableBoolean = Type.Union([Type.Boolean(), Type.Null()]);

const usageSchema = Type.Object(
  {
    decoded_bytes: Type.Integer({ minimum: 0 }),
    wire_bytes: Type.Integer({ minimum: 0 }),
    wire_estimated: Type.Boolean(),
    requests: Type.Integer({ minimum: 0 }),
    wire_incomplete: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const errorSchema = Type.Object(
  {
    code: Type.String(),
    status: Type.Optional(Type.Integer({ minimum: 100, maximum: 599 })),
    serverCode: Type.Optional(Type.String()),
    requestId: Type.Optional(Type.String()),
    retryAfterMs: Type.Optional(Type.Integer({ minimum: 0 })),
    reason: Type.Optional(Type.String()),
    usage: Type.Optional(usageSchema),
  },
  { additionalProperties: false },
);

const resultEnvelope = (response: TSchema) =>
  Type.Object(
    {
      status: Type.Union([
        Type.Literal("ok"),
        Type.Literal("not_found"),
        Type.Literal("error"),
      ]),
      requestId: Type.Optional(Type.String()),
      response: Type.Optional(response),
      error: Type.Optional(errorSchema),
    },
    { additionalProperties: false },
  );

const listingItemSchema = Type.Object(
  {
    asin: Type.String({ pattern: "^[A-Z0-9]{10}$" }),
    title: Type.String(),
    brand: nullableText,
    price: nullableText,
    price_amount: nullableAmount,
    currency: nullableText,
    rating: Type.Union([Type.Number({ minimum: 0, maximum: 5 }), Type.Null()]),
    review_count: nullableCount,
    rank_position: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    badge: nullableText,
    sponsored: nullableBoolean,
    image_url: nullableText,
    product_url: Type.String(),
    node: nullableText,
    source: Type.Union([Type.Literal("new_releases"), Type.Literal("search")]),
    fetched_at: Type.String(),
  },
  { additionalProperties: true },
);

const listingResponseSchema = Type.Object(
  {
    schema_version: Type.Literal(AMAZON_SCHEMA_VERSION),
    source: Type.Union([Type.Literal("new_releases"), Type.Literal("search")]),
    node: nullableText,
    keyword: nullableText,
    page: Type.Integer({ minimum: AMAZON_MIN_PAGE, maximum: AMAZON_MAX_PAGE }),
    item_count: Type.Integer({ minimum: 0 }),
    items: Type.Array(listingItemSchema, {
      maxItems: AMAZON_MAX_LISTING_ITEMS,
    }),
    fetched_at: Type.String(),
    cached: Type.Boolean(),
    usage: usageSchema,
  },
  { additionalProperties: true },
);

const productDetailSchema = Type.Object(
  {
    asin: Type.String({ pattern: "^[A-Z0-9]{10}$" }),
    title: Type.String(),
    brand: nullableText,
    manufacturer: nullableText,
    seller_name: nullableText,
    sold_by_amazon: nullableBoolean,
    price: nullableText,
    price_amount: nullableAmount,
    currency: nullableText,
    rating: Type.Union([Type.Number({ minimum: 0, maximum: 5 }), Type.Null()]),
    review_count: nullableCount,
    date_first_available: nullableText,
    release_date: nullableText,
    variation_parent_asin: nullableText,
    variation_count: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    category_path: Type.Array(Type.String()),
    best_sellers_rank: Type.Array(
      Type.Object(
        {
          rank: Type.Integer({ minimum: 1 }),
          category: Type.String(),
        },
        { additionalProperties: true },
      ),
    ),
    bullet_points: Type.Array(Type.String()),
    has_brand_store: nullableBoolean,
    has_video: nullableBoolean,
    subscription_available: nullableBoolean,
    image_url: nullableText,
    product_url: Type.String(),
    source: Type.Literal("pdp"),
    fetched_at: Type.String(),
    warnings: Type.Array(Type.String()),
  },
  { additionalProperties: true },
);

const productResponseSchema = Type.Object(
  {
    schema_version: Type.Literal(AMAZON_SCHEMA_VERSION),
    product: productDetailSchema,
    cached: Type.Boolean(),
    usage: usageSchema,
  },
  { additionalProperties: true },
);

const timeoutField = Type.Optional(
  Type.Integer({
    minimum: AMAZON_MIN_TIMEOUT_MS,
    maximum: AMAZON_MAX_TIMEOUT_MS,
    description:
      "Server acquisition budget in milliseconds, including queue time. Default: 30000.",
  }),
);
const pageField = Type.Optional(
  Type.Integer({
    minimum: AMAZON_MIN_PAGE,
    maximum: AMAZON_MAX_PAGE,
    default: AMAZON_MIN_PAGE,
    description:
      "One provider page, 1-5. Each page is a separate call; a provider-side out-of-range page is an empty listing. Pages outside 1-5 are rejected before dispatch.",
  }),
);
const releasesNodeField = Type.Optional(
  Type.String({
    pattern: "^[A-Za-z0-9_-]{1,64}(?:/[0-9]{1,12})?$",
    description:
      "Department slug such as baby-products, or slug/numeric such as baby-products/166764011. Omit for the root New Releases page.",
  }),
);
const searchNodeField = Type.Optional(
  Type.String({
    pattern: "^(?:[0-9]{1,12}|[A-Za-z0-9_-]{1,64}/[0-9]{1,12})$",
    description:
      "Numeric browse node such as 166764011, or slug/numeric such as baby-products/166764011. A bare department slug is rejected because Amazon would ignore it.",
  }),
);
const asinField = Type.String({
  pattern: "^[A-Za-z0-9]{10}$",
  minLength: 10,
  maxLength: 10,
  description: "10-character ASIN; lower case is accepted and canonicalized.",
});

export const amazonNewReleasesDefinition = {
  name: "amazon_new_releases",
  label: "Amazon New Releases",
  description:
    "Read one Amazon New Releases page through the discovery service. node is a department slug (baby-products) or slug/numeric subcategory; page is one provider page 1-5. Items carry ASIN, title, price, rating/reviews, listing position, badge, sponsored flag, node and canonical product URL. New Releases has no byline or date: brand is usually null and there is no launch date, so this listing cannot date a launch by itself; diff successive sweeps for new ASINs. One client call per page, cached responses report zero usage; no client retry.",
  promptSnippet:
    "amazon_new_releases(node, page): one Amazon New Releases page, no dates",
  promptGuidelines: [
    "Use amazon_new_releases for sweep diffs of new ASINs, not to date a launch: the listing carries no byline and no date.",
    "Each call returns one provider page (pages 1-5); there is no cursor and this client never retries.",
    "usage is per call, so sum decoded/wire bytes and requests across the pages you fetch.",
    "A provider-side empty page (usually the end of a category) is not proof of no new items; the tool itself rejects pages outside 1-5.",
  ],
  outputSchema: resultEnvelope(listingResponseSchema),
  parameters: Type.Object(
    {
      node: releasesNodeField,
      page: pageField,
      timeout_ms: timeoutField,
    },
    { additionalProperties: false },
  ),
};

export const amazonSearchDefinition = {
  name: "amazon_search",
  label: "Amazon search",
  description:
    "Search Amazon through the discovery service with a server-owned sort: newest (date-desc-rank) by default, or relevance. keyword is 1-120 characters; node is a numeric browse node or slug/numeric. Items carry ASIN, title, price, rating/reviews, listing position, badge, sponsored flag and canonical product URL. Newest-sorted and relevance-sorted search are discovery only, not launch signals. One client call per page (pages 1-5), cached responses report zero usage; no client retry.",
  promptSnippet:
    "amazon_search(keyword, node, page, sort): one Amazon discovery page",
  promptGuidelines: [
    "Use amazon_search for discovery and amazon_new_releases for sweep diffs; neither newest nor relevance ordering is a launch signal.",
    "A bare department slug as node is invalid for search; pass a numeric browse node or slug/numeric.",
    "Each call returns one provider page (pages 1-5); there is no cursor and this client never retries. A provider-side empty page is not proof that no matching products exist.",
    "rank_position is the listing position, not a sales rank; use amazon_product for best-sellers rank. Enrich only the ASINs you need with amazon_product afterwards.",
  ],
  outputSchema: resultEnvelope(listingResponseSchema),
  parameters: Type.Object(
    {
      keyword: Type.String({ minLength: 1, maxLength: 120 }),
      node: searchNodeField,
      page: pageField,
      sort: Type.Optional(
        Type.Union([Type.Literal("newest"), Type.Literal("relevance")], {
          default: "newest",
          description:
            "Server-owned sort. newest maps to date-desc-rank and is the default.",
        }),
      ),
      timeout_ms: timeoutField,
    },
    { additionalProperties: false },
  ),
};

export const amazonProductDefinition = {
  name: "amazon_product",
  label: "Amazon product detail",
  description:
    "Read one Amazon product detail page through the discovery service. asin is canonicalized to upper case. Returns brand, manufacturer, seller, price, rating/reviews, date_first_available, release_date, variation parent/count, category path, best sellers rank, bullet points, brand-store/video/subscription flags and provider warnings. date_first_available is sparse provider evidence: brand-new ASINs usually omit it, so never treat it as a launch date. One client call, cached responses report zero usage; no client retry.",
  promptSnippet:
    "amazon_product(asin): one Amazon product page, sparse date evidence",
  promptGuidelines: [
    "Use amazon_product only for ASINs that already came from a listing; it never searches.",
    "date_first_available is sparse evidence, so combine first-seen sweep diffs with it instead of trusting it as a launch date.",
    "Collapse variations via variation_parent_asin/variation_count before counting brands.",
    "Warnings such as date_first_available_missing or price_missing are provider facts, not client errors.",
  ],
  outputSchema: resultEnvelope(productResponseSchema),
  parameters: Type.Object(
    {
      asin: asinField,
      timeout_ms: timeoutField,
    },
    { additionalProperties: false },
  ),
};
