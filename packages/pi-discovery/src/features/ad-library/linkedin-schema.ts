import { Type, type Static } from "typebox";

const selector = Type.Optional(Type.String({ minLength: 1, maxLength: 200 }));
const dateOption = Type.Union([
  Type.Literal("last-30-days"),
  Type.Literal("current-month"),
  Type.Literal("current-year"),
  Type.Literal("last-year"),
  Type.Literal("custom-date-range"),
]);
const date = Type.Optional(
  Type.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }),
);
const sort = Type.Union([Type.Literal("newest"), Type.Literal("oldest")]);
export const linkedinParameters = Type.Object(
  {
    keyword: selector,
    payer: selector,
    account_owner: selector,
    page_id: Type.Optional(Type.String({ pattern: "^[0-9]{1,32}$" })),
    linkedin_url: Type.Optional(Type.String({ minLength: 1, maxLength: 253 })),
    country: Type.Optional(
      Type.String({ pattern: "^([A-Za-z]{2}|[Aa][Ll][Ll])$" }),
    ),
    date_option: Type.Optional(dateOption),
    start_date: date,
    end_date: date,
    sort: Type.Optional(sort),
    include_transparency: Type.Optional(Type.Boolean()),
    max_ads: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
    timeout_ms: Type.Optional(Type.Integer({ minimum: 5000, maximum: 180000 })),
    cursor: Type.Optional(
      Type.String({ pattern: "^[!-~]+$", maxLength: 65536 }),
    ),
  },
  { additionalProperties: false },
);

const text = Type.Union([Type.String(), Type.Null()]);
const count = Type.Integer({ minimum: 0 });
const image = Type.Object({ url: text, alt_text: text });
const ad = Type.Object({
  ad_id: Type.String(),
  creative_type: text,
  format: text,
  media_type: text,
  advertiser: Type.Object({
    page_id: text,
    page_url: text,
    name: text,
    logo_url: text,
  }),
  promoted: Type.Union([Type.Boolean(), Type.Null()]),
  author: Type.Union([
    Type.Object({ name: text, headline: text, avatar_url: text }),
    Type.Null(),
  ]),
  commentary: text,
  commentary_truncated: Type.Boolean(),
  headline: text,
  cta: text,
  image: Type.Union([image, Type.Null()]),
  video_poster_url: text,
  carousel: Type.Array(image),
  destination_url: text,
  detail_url: text,
  transparency: Type.Union([
    Type.Object({
      start_date: text,
      end_date: text,
      payer: text,
      total_impressions: text,
      impressions_by_country: Type.Array(
        Type.Object({ country: Type.String(), impressions: Type.String() }),
      ),
      targeting: Type.Object({
        language: text,
        location: text,
        disclosures: Type.Optional(
          Type.Array(
            Type.Object({ label: Type.String(), text: Type.String() }),
          ),
        ),
        disclosures_truncated: Type.Optional(Type.Boolean()),
      }),
    }),
    Type.Null(),
  ]),
});
export const linkedinResponse = Type.Object({
  provider: Type.Literal("linkedin_ad_library"),
  id: Type.String(),
  mode: Type.Union([Type.Literal("keyword"), Type.Literal("page")]),
  query: Type.String(),
  country: Type.String(),
  resolved_page_id: Type.Optional(text),
  date_option: Type.Union([dateOption, Type.Null()]),
  sort,
  ads: Type.Array(ad),
  total_ads: Type.Union([count, Type.Null()]),
  advertisers: Type.Array(
    Type.Object({
      page_id: text,
      name: text,
      ads: count,
      creative_types: Type.Array(Type.String()),
    }),
  ),
  max_ads_adjustment: Type.Union([
    Type.Object({ requested: count, effective: Type.Literal(24) }),
    Type.Null(),
  ]),
  next_cursor: text,
  cap_reason: text,
  dropped: count,
  complete: Type.Boolean(),
  partial: Type.Boolean(),
  truncated: Type.Boolean(),
  truncation: Type.Array(Type.String()),
  pages: Type.Array(
    Type.Object({
      page: count,
      http_status: count,
      groups: count,
      ads: count,
      returned: count,
      response_sha256: Type.String(),
    }),
  ),
  failed_pages: Type.Array(
    Type.Object({
      page: count,
      error_code: Type.String(),
      reason: text,
      stage: Type.Optional(text),
    }),
  ),
  transparency: Type.Union([
    Type.Object({
      requested: count,
      fetched: count,
      failed: count,
      skipped: Type.Boolean(),
    }),
    Type.Null(),
  ]),
  timings: Type.Object({
    queue_ms: count,
    upstream_ms: count,
    total_ms: count,
  }),
});
export type LinkedInAdsParams = Static<typeof linkedinParameters>;
export type LinkedInAdsResult = Static<typeof linkedinResponse>;

export function validCompanyReference(value: string): boolean {
  return (
    /^[a-z0-9][a-z0-9-]{0,99}$/i.test(value) ||
    /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[a-z0-9][a-z0-9-]{0,99}(?:\/mycompany)?\/?$/i.test(
      value,
    )
  );
}
