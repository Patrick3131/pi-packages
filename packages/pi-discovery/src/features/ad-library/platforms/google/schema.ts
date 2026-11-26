import { Type, type Static } from "typebox";

/** Wire contract of POST /v1/ad-library/google/search (Google Ads Transparency). */
const optionalText = Type.Optional(Type.Union([Type.String(), Type.Null()]));
const optionalInt = (minimum = 0) =>
  Type.Optional(Type.Union([Type.Integer({ minimum }), Type.Null()]));

const adCopy = Type.Object(
  {
    // Best-effort decoded copy; never synthesized, never a click-through.
    headline: optionalText,
    description: optionalText,
    // Google's visible URL; the platform publishes no destination.
    display_url: optionalText,
    extras: Type.Optional(
      Type.Array(Type.String({ maxLength: 100 }), { maxItems: 10 }),
    ),
    truncated: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const variant = Type.Object(
  {
    preview_url: optionalText,
    image_url: optionalText,
    height: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    width: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  },
  { additionalProperties: true },
);

const ad = Type.Object(
  {
    archive_id: Type.String(),
    advertiser_id: optionalText,
    advertiser_name: optionalText,
    format: Type.Optional(
      Type.Union([
        Type.Literal("text"),
        Type.Literal("image"),
        Type.Literal("video"),
        Type.Null(),
      ]),
    ),
    format_code: optionalInt(),
    first_shown: optionalText,
    last_shown: optionalText,
    days_shown: optionalInt(),
    domain: optionalText,
    variants: Type.Optional(Type.Array(variant, { maxItems: 10 })),
    ad_copy: Type.Optional(Type.Union([adCopy, Type.Null()])),
    creative_truncated: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const pageReceipt = Type.Object({
  page: Type.Integer({ minimum: 1 }),
  http_status: Type.Integer(),
  groups: Type.Integer({ minimum: 0 }),
  ads: Type.Integer({ minimum: 0 }),
  returned: Type.Integer({ minimum: 0 }),
  response_sha256: Type.String(),
});

const failedPage = Type.Object(
  {
    page: Type.Integer({ minimum: 1 }),
    error_code: Type.String(),
    reason: optionalText,
    http_status: optionalInt(),
    stage: Type.Optional(
      Type.Union([
        Type.Literal("initial_results"),
        Type.Literal("pagination"),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: true },
);

export const googleResponse = Type.Object(
  {
    id: Type.String(),
    provider: Type.Literal("google_ads_transparency"),
    mode: Type.Union([Type.Literal("domain"), Type.Literal("advertiser")]),
    query: Type.String(),
    country: Type.String(),
    media_type: Type.Union([
      Type.Literal("text"),
      Type.Literal("image"),
      Type.Literal("video"),
      Type.Literal("all"),
    ]),
    // Google's declared total; advisory only, completion is token-driven.
    total_ad_count: optionalInt(),
    // Overlay-drift tripwire: preview-carrying ads whose copy did not decode.
    copy_unparsed: Type.Integer({ minimum: 0 }),
    max_ads_adjustment: Type.Optional(
      Type.Union([
        Type.Object({
          requested: Type.Integer({ minimum: 1, maximum: 39 }),
          effective: Type.Literal(40),
        }),
        Type.Null(),
      ]),
    ),
    next_cursor: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    complete: Type.Boolean(),
    partial: Type.Boolean(),
    retry_after_s: optionalInt(1),
    ads: Type.Array(ad),
    pages: Type.Optional(Type.Array(pageReceipt)),
    failed_pages: Type.Optional(Type.Array(failedPage)),
    truncation: Type.Array(
      Type.Union([
        Type.Literal("page_budget"),
        Type.Literal("max_ads"),
        Type.Literal("cursor_unknown"),
      ]),
    ),
    truncated: Type.Boolean(),
    timings: Type.Object({
      queue_ms: Type.Number({ minimum: 0 }),
      upstream_ms: Type.Number({ minimum: 0 }),
      total_ms: Type.Number({ minimum: 0 }),
    }),
  },
  { additionalProperties: true },
);

/** One whole 40-ad page is the minimum reachable sample. */
export const GOOGLE_PAGE_SIZE = 40;

export const googleParameters = Type.Object(
  {
    domain: Type.Optional(Type.String({ minLength: 3, maxLength: 253 })),
    advertiser_id: Type.Optional(
      Type.String({ pattern: "^AR[0-9]{6,}$", maxLength: 64 }),
    ),
    country: Type.Optional(Type.String({ minLength: 2, maxLength: 10 })),
    media_type: Type.Optional(
      Type.Union([
        Type.Literal("text"),
        Type.Literal("image"),
        Type.Literal("video"),
        Type.Literal("all"),
      ]),
    ),
    max_ads: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
    timeout_ms: Type.Optional(
      Type.Integer({ minimum: 5000, maximum: 180000 }),
    ),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 65536 })),
  },
  { additionalProperties: false },
);

export type GoogleAdsParams = Static<typeof googleParameters>;
export type GoogleAd = Static<typeof ad>;
export type GoogleAdCopy = Static<typeof adCopy>;
export type GoogleVariant = Static<typeof variant>;
export type GoogleAdsResult = Static<typeof googleResponse>;
