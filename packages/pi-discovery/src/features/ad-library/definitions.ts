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
export const metaResponse = Type.Object(
  {
    provider: Type.Literal("meta_ad_library"),
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
    max_ads_adjustment: Type.Optional(
      Type.Union([
        Type.Object({
          requested: Type.Integer({ minimum: 1, maximum: 9 }),
          effective: Type.Literal(10),
        }),
        Type.Null(),
      ]),
    ),
    dropped: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: true },
);
