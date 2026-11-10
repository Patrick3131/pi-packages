/**
 * Wire contract for the Discovery social routes (Instagram public metadata).
 * Field names stay snake_case so structured output matches the API exactly.
 */

export type SocialPlatform = "instagram" | "tiktok";

/** Post content type. Carousel children never use `carousel` as their own type. */
export type SocialContentType = "image" | "video" | "carousel" | "unknown";
export type SocialChildContentType = Exclude<SocialContentType, "carousel">;

/**
 * Known truncation categories in server emit order. Kept as plain strings in
 * validation so a new server category still reaches the model.
 */
export type SocialTruncation =
  | "deadline"
  | "page_cap"
  | "page_failure"
  | "upstream_failure"
  | "profile_private";

/** Known warning categories in server emit order. */
export type SocialWarning =
  | "pinned_posts_may_lead"
  | "posts_unavailable"
  | "like_counts_hidden"
  | "media_urls_expire"
  | "metrics_unparsed";

/** Sample-wide stop stage. */
export type SocialFailureStage = "listing" | "hydration";

/** Sanitized house error codes emitted by the social routes. */
export const SOCIAL_SERVER_CODES = new Set([
  "social_invalid_request",
  "social_disabled",
  "social_profile_not_found",
  "social_post_not_found",
  "social_queue_full",
  "social_rate_limited",
  "social_blocked",
  "social_upstream",
  "social_schema_changed",
  "social_timeout",
  "social_verification_required",
]);

export const SOCIAL_PROFILE_NOT_FOUND = "social_profile_not_found";
export const SOCIAL_POST_NOT_FOUND = "social_post_not_found";

export const SOCIAL_URL_MAX_LENGTH = 512;
export const SOCIAL_MAX_POSTS = 50;
export const SOCIAL_DEFAULT_MAX_POSTS = 12;
export const SOCIAL_RECORD_TIMEOUT_MIN_MS = 5000;
export const SOCIAL_RECORD_TIMEOUT_MAX_MS = 60000;
export const SOCIAL_SAMPLE_TIMEOUT_MAX_MS = 180000;
/** Server default when the tool omits `timeout_ms` for profile/post. */
export const SOCIAL_DEFAULT_RECORD_TIMEOUT_MS = 30000;
/** Server default when the tool omits `timeout_ms` for profile-posts. */
export const SOCIAL_DEFAULT_SAMPLE_TIMEOUT_MS = 120000;
/** Client HTTP budget beyond the effective server budget. */
export const SOCIAL_HTTP_TIMEOUT_MARGIN_MS = 10000;

export interface SocialTimings {
  queue_ms: number;
  upstream_ms: number;
  total_ms: number;
}

export interface SocialBioLink {
  url: string;
  title: string | null;
  type: string | null;
  [key: string]: unknown;
}

export interface SocialProfile {
  id: string;
  username: string;
  url: string;
  full_name: string | null;
  biography: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  following_count: number | null;
  post_count: number | null;
  is_private: boolean;
  is_verified: boolean;
  bio_links: SocialBioLink[];
  total_like_count?: number | null;
  [key: string]: unknown;
}

export interface SocialMediaRef {
  url: string;
  width: number | null;
  height: number | null;
  [key: string]: unknown;
}

export interface SocialAuthor {
  id: string;
  username: string;
  [key: string]: unknown;
}

export interface SocialCarouselItem {
  id: string;
  content_type: SocialChildContentType;
  thumbnail: SocialMediaRef | null;
  video: SocialMediaRef | null;
  [key: string]: unknown;
}

export interface SocialMusic {
  id: string | null;
  title: string | null;
  author_name: string | null;
  original: boolean | null;
  [key: string]: unknown;
}

export interface SocialPost {
  id: string;
  shortcode: string | null;
  url: string;
  author: SocialAuthor;
  coauthors: string[];
  caption: string | null;
  accessibility_caption: string | null;
  published_at: string;
  content_type: SocialContentType;
  product_type: string | null;
  thumbnail: SocialMediaRef | null;
  video: SocialMediaRef | null;
  carousel: SocialCarouselItem[];
  like_count: number | null;
  comment_count: number | null;
  view_count: number | null;
  play_count: number | null;
  share_count?: number | null;
  collect_count?: number | null;
  like_counts_hidden: boolean | null;
  is_paid_partnership: boolean | null;
  music?: SocialMusic | null;
  hashtags?: string[];
  is_ad?: boolean | null;
  is_aigc?: boolean | null;
  [key: string]: unknown;
}

export interface SocialProfileResponse {
  id: string;
  platform: SocialPlatform;
  observed_at: string;
  profile: SocialProfile;
  warnings?: string[];
  timings: SocialTimings;
  [key: string]: unknown;
}

export interface SocialPostResponse {
  id: string;
  platform: SocialPlatform;
  observed_at: string;
  post: SocialPost;
  warnings?: string[];
  timings: SocialTimings;
  [key: string]: unknown;
}

export interface SocialFailedPost {
  shortcode: string;
  error_code: string;
  reason: string | null;
  [key: string]: unknown;
}

export interface SocialSampleFailure {
  stage: SocialFailureStage;
  error_code: string;
  reason: string | null;
  retry_after_s: number | null;
  [key: string]: unknown;
}

export interface SocialProfilePostsResponse {
  id: string;
  platform: SocialPlatform;
  observed_at: string;
  profile: SocialProfile;
  posts: SocialPost[];
  requested_posts: number;
  returned_posts: number;
  has_more_posts: boolean | null;
  partial: boolean;
  failed_posts: SocialFailedPost[];
  sample_failure: SocialSampleFailure | null;
  truncation: string[];
  warnings: string[];
  timings: SocialTimings;
  [key: string]: unknown;
}

export interface SocialProfileParams {
  platform?: SocialPlatform;
  username?: string;
  url?: string;
  timeout_ms?: number;
}

export interface SocialProfilePostsParams extends SocialProfileParams {
  max_posts?: number;
}

export interface SocialPostParams {
  platform?: SocialPlatform;
  shortcode?: string;
  video_id?: string;
  username?: string;
  url?: string;
  timeout_ms?: number;
}

export interface SocialClientOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

/** Typed result envelope shared by `structuredContent` and `details`. */
export interface SocialResultEnvelope<R> {
  status: "ok" | "partial" | "not_found" | "error";
  requestId?: string;
  response?: R;
  error?: SocialResultError;
}

export interface SocialResultError {
  code: string;
  status?: number;
  serverCode?: string;
  requestId?: string;
  retryAfterMs?: number;
  reason?: string;
}
