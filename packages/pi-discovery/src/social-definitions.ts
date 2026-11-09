import { Type, type TSchema } from "typebox";
import {
  SOCIAL_DEFAULT_MAX_POSTS,
  SOCIAL_MAX_POSTS,
  SOCIAL_RECORD_TIMEOUT_MAX_MS,
  SOCIAL_RECORD_TIMEOUT_MIN_MS,
  SOCIAL_SAMPLE_TIMEOUT_MAX_MS,
  SOCIAL_URL_MAX_LENGTH,
} from "./social-types.js";

const nullableText = Type.Union([Type.String(), Type.Null()]);
const nullableCount = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
const nullableDimension = Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]);
const nullableBoolean = Type.Union([Type.Boolean(), Type.Null()]);
const nullableTextList = Type.Array(Type.String());
const mediaRefSchema = Type.Union([
  Type.Object(
    {
      url: Type.String(),
      width: nullableDimension,
      height: nullableDimension,
    },
    { additionalProperties: true },
  ),
  Type.Null(),
]);
const timingsSchema = Type.Object(
  {
    queue_ms: Type.Integer({ minimum: 0 }),
    upstream_ms: Type.Integer({ minimum: 0 }),
    total_ms: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: true },
);
const profileSchema = Type.Object(
  {
    id: Type.String(),
    username: Type.String(),
    url: Type.String(),
    full_name: nullableText,
    biography: nullableText,
    avatar_url: nullableText,
    follower_count: nullableCount,
    following_count: nullableCount,
    post_count: nullableCount,
    is_private: Type.Boolean(),
    is_verified: Type.Boolean(),
    bio_links: Type.Array(
      Type.Object(
        { url: Type.String(), title: nullableText, type: nullableText },
        { additionalProperties: true },
      ),
      { maxItems: 10 },
    ),
  },
  { additionalProperties: true },
);
const carouselItemSchema = Type.Object(
  {
    id: Type.String(),
    content_type: Type.Union([
      Type.Literal("image"),
      Type.Literal("video"),
      Type.Literal("unknown"),
    ]),
    thumbnail: mediaRefSchema,
    video: mediaRefSchema,
  },
  { additionalProperties: true },
);
const postSchema = Type.Object(
  {
    id: Type.String(),
    shortcode: Type.String(),
    url: Type.String(),
    author: Type.Object(
      { id: Type.String(), username: Type.String() },
      { additionalProperties: true },
    ),
    coauthors: nullableTextList,
    caption: nullableText,
    accessibility_caption: nullableText,
    published_at: Type.String(),
    content_type: Type.Union([
      Type.Literal("image"),
      Type.Literal("video"),
      Type.Literal("carousel"),
      Type.Literal("unknown"),
    ]),
    product_type: nullableText,
    thumbnail: mediaRefSchema,
    video: mediaRefSchema,
    carousel: Type.Array(carouselItemSchema, { maxItems: 20 }),
    like_count: nullableCount,
    comment_count: nullableCount,
    view_count: nullableCount,
    play_count: nullableCount,
    like_counts_hidden: Type.Boolean(),
    is_paid_partnership: nullableBoolean,
  },
  { additionalProperties: true },
);
const profileResponseSchema = Type.Object(
  {
    id: Type.String(),
    platform: Type.Literal("instagram"),
    observed_at: Type.String(),
    profile: profileSchema,
    timings: timingsSchema,
  },
  { additionalProperties: true },
);
const postResponseSchema = Type.Object(
  {
    id: Type.String(),
    platform: Type.Literal("instagram"),
    observed_at: Type.String(),
    post: postSchema,
    timings: timingsSchema,
  },
  { additionalProperties: true },
);
const failedPostSchema = Type.Object(
  {
    shortcode: Type.String(),
    error_code: Type.String(),
    reason: nullableText,
  },
  { additionalProperties: true },
);
const sampleFailureSchema = Type.Union([
  Type.Object(
    {
      stage: Type.Union([Type.Literal("listing"), Type.Literal("hydration")]),
      error_code: Type.String(),
      reason: nullableText,
      retry_after_s: nullableCount,
    },
    { additionalProperties: true },
  ),
  Type.Null(),
]);
const profilePostsResponseSchema = Type.Object(
  {
    id: Type.String(),
    platform: Type.Literal("instagram"),
    observed_at: Type.String(),
    profile: profileSchema,
    posts: Type.Array(postSchema, { maxItems: SOCIAL_MAX_POSTS }),
    requested_posts: Type.Integer({ minimum: 1, maximum: SOCIAL_MAX_POSTS }),
    returned_posts: Type.Integer({ minimum: 0, maximum: SOCIAL_MAX_POSTS }),
    has_more_posts: nullableBoolean,
    partial: Type.Boolean(),
    failed_posts: Type.Array(failedPostSchema, { maxItems: SOCIAL_MAX_POSTS }),
    sample_failure: sampleFailureSchema,
    truncation: Type.Array(Type.String(), { maxItems: 10 }),
    warnings: Type.Array(Type.String(), { maxItems: 10 }),
    timings: timingsSchema,
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
  },
  { additionalProperties: false },
);
/** Typed envelope shared by `structuredContent` and `details`. */
const resultEnvelope = (response: TSchema) =>
  Type.Object(
    {
      status: Type.Union([
        Type.Literal("ok"),
        Type.Literal("partial"),
        Type.Literal("not_found"),
        Type.Literal("error"),
      ]),
      requestId: Type.Optional(Type.String()),
      response: Type.Optional(response),
      error: Type.Optional(errorSchema),
    },
    { additionalProperties: false },
  );

const platformField = Type.Optional(
  Type.Literal("instagram", {
    description: "Only instagram is supported; omit or pass instagram.",
  }),
);
const usernameField = Type.String({
  pattern: "^[A-Za-z0-9._]{1,30}$",
  minLength: 1,
  maxLength: 30,
  description: "Instagram handle without @.",
});
const profileUrlField = Type.String({
  minLength: 1,
  maxLength: SOCIAL_URL_MAX_LENGTH,
  description:
    "HTTPS instagram.com or www.instagram.com profile URL, for example https://www.instagram.com/lovelaurieb/.",
});
const postUrlField = Type.String({
  minLength: 1,
  maxLength: SOCIAL_URL_MAX_LENGTH,
  description:
    "HTTPS Instagram post URL: /p/<shortcode>/, /reel/<shortcode>/, /reels/<shortcode>/ or /<username>/p/<shortcode>/.",
});
const shortcodeField = Type.String({
  pattern: "^[A-Za-z0-9_-]{5,20}$",
  minLength: 5,
  maxLength: 20,
  description: "Exact Instagram shortcode.",
});
const recordTimeoutField = Type.Optional(
  Type.Integer({
    minimum: SOCIAL_RECORD_TIMEOUT_MIN_MS,
    maximum: SOCIAL_RECORD_TIMEOUT_MAX_MS,
    description:
      "Server acquisition budget in milliseconds, including queue time. Default: 30000.",
  }),
);
const sampleTimeoutField = Type.Optional(
  Type.Integer({
    minimum: SOCIAL_RECORD_TIMEOUT_MIN_MS,
    maximum: SOCIAL_SAMPLE_TIMEOUT_MAX_MS,
    description:
      "Server acquisition budget in milliseconds, including queue time. Default: 120000.",
  }),
);
const maxPostsField = Type.Optional(
  Type.Integer({
    minimum: 1,
    maximum: SOCIAL_MAX_POSTS,
    default: SOCIAL_DEFAULT_MAX_POSTS,
    description: `Distinct hydration candidates to sample (1-${SOCIAL_MAX_POSTS}). Default: ${SOCIAL_DEFAULT_MAX_POSTS}.`,
  }),
);

function profileParameters(extra: Record<string, TSchema> = {}) {
  return Type.Union([
    Type.Object(
      { username: usernameField, platform: platformField, ...extra },
      { additionalProperties: false },
    ),
    Type.Object(
      { url: profileUrlField, platform: platformField, ...extra },
      { additionalProperties: false },
    ),
  ]);
}
function postParameters() {
  return Type.Union([
    Type.Object(
      {
        shortcode: shortcodeField,
        platform: platformField,
        timeout_ms: recordTimeoutField,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      { url: postUrlField, platform: platformField, timeout_ms: recordTimeoutField },
      { additionalProperties: false },
    ),
  ]);
}

export const socialProfileDefinition = {
  name: "social_profile",
  label: "Instagram profile",
  description:
    "Look up one public Instagram profile: identity, follower/following/post counts, bio and bio links. One profile query only, so this is the cheap lookup before any sample. Private profile metadata can be returned, but private posts, stories and comments are never fetched. Counts are as observed and may be null; media URLs are references only.",
  promptSnippet:
    "social_profile(username|url): one public Instagram profile lookup",
  promptGuidelines: [
    "Use social_profile for identity and counts; only call social_profile_posts when actual post records are needed.",
    "Null profile counts mean unobserved, not zero; keep null, zero and hidden values distinct.",
  ],
  outputSchema: resultEnvelope(profileResponseSchema),
  parameters: profileParameters({ timeout_ms: recordTimeoutField }),
};
export const socialProfilePostsDefinition = {
  name: "social_profile_posts",
  label: "Instagram profile posts",
  description:
    "Return one public Instagram profile plus a bounded sample of fully hydrated posts (default 12, max 50). Costs roughly one profile query, one listing pass per 12 candidates and one hydration per candidate, so it is materially more expensive than social_profile. Order is upstream encounter order: pinned posts may lead and this is not a latest-chronological feed. partial=true is not a retry signal; inspect failed_posts, sample_failure (including retry_after_s) and truncation before deciding another call is worth the cost. Continuation is tri-state: true means unselected candidates remained, false means proven exhaustion, null means unknown. Media URLs are references only and may expire.",
  promptSnippet:
    "social_profile_posts(username|url, max_posts): profile plus a bounded hydrated post sample",
  promptGuidelines: [
    "Use social_profile_posts only when post records are needed; it costs one hydration per candidate.",
    "Never present returned posts as the latest N posts: pinned posts may lead and order is upstream encounter.",
    "Partial results are typed detail, not an automatic retry; this client never retries, rotates proxies or reacquires because partial is true.",
    "Preserve warnings about private profiles, pinned order and expiring media URLs.",
  ],
  outputSchema: resultEnvelope(profilePostsResponseSchema),
  parameters: profileParameters({
    max_posts: maxPostsField,
    timeout_ms: sampleTimeoutField,
  }),
};
export const socialPostDefinition = {
  name: "social_post",
  label: "Instagram post",
  description:
    "Look up one exact public Instagram post by shortcode or URL. One post query; returns the actual author, caption, content type, hidden/null-explicit counts, carousel children and media URL references. No media is downloaded and counts can be hidden, zero or unknown.",
  promptSnippet:
    "social_post(shortcode|url): one exact public Instagram post record",
  promptGuidelines: [
    "A not_found result proves this route returned no public post, not that the account is private.",
    "Media URLs are references only; do not treat them as stable or as downloaded assets.",
  ],
  outputSchema: resultEnvelope(postResponseSchema),
  parameters: postParameters(),
};

