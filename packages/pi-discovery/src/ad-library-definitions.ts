import { Type } from "typebox";

const optionalText = Type.Optional(Type.Union([Type.String(), Type.Null()]));
const imageFields = {
  original_image_url: optionalText,
  resized_image_url: optionalText,
  watermarked_resized_image_url: optionalText,
};
const videoFields = {
  video_hd_url: optionalText,
  video_sd_url: optionalText,
  video_preview_image_url: optionalText,
  watermarked_video_hd_url: optionalText,
  watermarked_video_sd_url: optionalText,
};
const cardFields = {
  ...imageFields,
  ...videoFields,
  headline: optionalText,
  body: optionalText,
  description: optionalText,
  caption: optionalText,
  cta: optionalText,
  cta_type: optionalText,
  landing_url: optionalText,
  landing_domain: optionalText,
};
const outputSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("ok"),
      Type.Literal("not_found"),
      Type.Literal("ambiguous"),
      Type.Literal("error"),
    ]),
    ads: Type.Array(
      Type.Object(
        {
          archive_id: Type.String(),
          page_id: optionalText,
          page_name: optionalText,
          landing_url: optionalText,
          landing_domain: optionalText,
          headline: optionalText,
          body: optionalText,
          description: optionalText,
          template_fields: Type.Optional(
            Type.Array(
              Type.Union([
                Type.Literal("headline"),
                Type.Literal("body"),
                Type.Literal("description"),
              ]),
            ),
          ),
          representative_card_index: Type.Optional(
            Type.Union([Type.Integer({ minimum: 0, maximum: 9 }), Type.Null()]),
          ),
          images: Type.Optional(
            Type.Array(Type.Object(imageFields), { maxItems: 10 }),
          ),
          videos: Type.Optional(
            Type.Array(Type.Object(videoFields), { maxItems: 10 }),
          ),
          cards: Type.Optional(
            Type.Array(Type.Object(cardFields), { maxItems: 10 }),
          ),
          creative_truncated: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: true },
      ),
    ),
    requestId: Type.Optional(Type.String()),
    partial: Type.Optional(Type.Boolean()),
    truncated: Type.Optional(Type.Boolean()),
    truncation: Type.Optional(Type.Array(Type.String())),
    next_cursor: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    complete: Type.Optional(Type.Boolean()),
    dropped: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: true },
);
const common = {
  country: Type.Optional(Type.String({ pattern: "^[a-zA-Z]{2}$" })),
  active_only: Type.Optional(Type.Boolean()),
  max_ads: Type.Optional(Type.Integer({ minimum: 10, maximum: 300 })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 5000, maximum: 180000 })),
};
export const adLibraryKeywordDefinition = {
  name: "ad_library_keyword_ads",
  label: "Meta keyword ads",
  description:
    "Discover advertisers by product keyword in Meta Ad Library. Ads evidence paid media, not budget or an open brief. Returns landing domains/URLs, page IDs, ad copy and supplied media/card metadata. Reuse page_id for known advertisers; surface partial/truncation flags. One call is a bounded sample: max_ads 10-300 (default 30), up to 10 pages, roughly 100 ads. truncated/cap_reason say whether more existed. To harvest, pass next_cursor as cursor until complete is true; when dropped>0 raise max_ads instead.",
  outputSchema,
  parameters: Type.Object(
    {
      keyword: Type.String({ minLength: 1, maxLength: 200 }),
      cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 65536 })),
      ...common,
    },
    { additionalProperties: false },
  ),
};
export const adLibraryDomainDefinition = {
  name: "ad_library_domain_ads",
  label: "Meta advertiser ads",
  description:
    "Find a known brand's ads by domain or explicit page_id. Domain resolution can be ambiguous; pass page_id when known. Returns landing domains/URLs, page IDs, ad copy and supplied media/card metadata. Reuse page_id for known advertisers; surface partial/truncation flags. One call is a bounded sample: max_ads 10-300 (default 30), up to 10 pages, roughly 100 ads. truncated/cap_reason say whether more existed. To harvest a page_id, pass next_cursor as cursor until complete is true; when dropped>0 raise max_ads instead.",
  outputSchema,
  parameters: Type.Union([
    Type.Object(
      { domain: Type.String({ minLength: 3, maxLength: 253 }), ...common },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        page_id: Type.String({ pattern: "^[0-9]{1,32}$" }),
        cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 65536 })),
        ...common,
      },
      { additionalProperties: false },
    ),
  ]),
};
