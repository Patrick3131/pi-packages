import { SocialClientError } from "./social-errors.js";
import {
  SOCIAL_DEFAULT_MAX_POSTS,
  SOCIAL_DEFAULT_RECORD_TIMEOUT_MS,
  SOCIAL_DEFAULT_SAMPLE_TIMEOUT_MS,
  SOCIAL_MAX_POSTS,
  SOCIAL_POST_NOT_FOUND,
  SOCIAL_RECORD_TIMEOUT_MAX_MS,
  SOCIAL_RECORD_TIMEOUT_MIN_MS,
  SOCIAL_SAMPLE_TIMEOUT_MAX_MS,
  SOCIAL_URL_MAX_LENGTH,
  type SocialCarouselItem,
  type SocialFailedPost,
  type SocialMediaRef,
  type SocialPost,
  type SocialPostParams,
  type SocialPostResponse,
  type SocialProfile,
  type SocialProfileParams,
  type SocialProfilePostsParams,
  type SocialProfilePostsResponse,
  type SocialProfileResponse,
  type SocialSampleFailure,
  type SocialTimings,
} from "./social-types.js";

/** One validated wire request: route, exact body and effective server budget. */
export interface SocialRequest {
  endpoint: string;
  body: Record<string, unknown>;
  serverTimeoutMs: number;
}

const invalid = (): never => {
  throw new SocialClientError("invalid_request");
};
const malformed = (): never => {
  throw new SocialClientError("malformed");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isDimension = (value: unknown): value is number | null =>
  value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
const isNullableText = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
// Shape check, not an allowlist: a new server reason must not require a republish.
const isReason = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value);
const isErrorCode = (value: unknown): value is string =>
  typeof value === "string" && /^social_[a-z_]{1,40}$/.test(value);
const isUtcTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value);

const USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const TIKTOK_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,24}$/;
const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,20}$/;
const VIDEO_ID_PATTERN = /^[0-9]{15,20}$/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com"]);
const POST_ROUTE_SEGMENTS = new Set(["p", "reel", "reels"]);
const TIKTOK_RESERVED = new Set([
  "foryou",
  "following",
  "explore",
  "discover",
  "search",
  "tag",
  "music",
  "share",
  "live",
  "upload",
  "about",
  "legal",
  "settings",
  "messages",
  "notifications",
  "embed",
  "trending",
]);
const RESERVED_PROFILE_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "accounts",
  "explore",
  "direct",
  "stories",
  "share",
  "graphql",
  "api",
]);

/** Canonical username or `invalid_request`; `.` and `..` are never handles. */
function validUsername(
  raw: unknown,
  platform: "instagram" | "tiktok" = "instagram",
): string {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  const pattern =
    platform === "tiktok" ? TIKTOK_USERNAME_PATTERN : USERNAME_PATTERN;
  if (!pattern.test(value) || value === "." || value === "..") return invalid();
  if (platform === "tiktok" && TIKTOK_RESERVED.has(value.toLowerCase()))
    return invalid();
  return value;
}

/**
 * Split a caller URL into path segments, mirroring the service rules: HTTPS
 * instagram.com/www.instagram.com only, no userinfo, explicit port, percent
 * encoding, backslash, control characters, traversal or extra segments.
 * Query and fragment are ignored; one trailing slash is optional.
 */
function instagramSegments(raw: unknown): string[] {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!value || value.length > SOCIAL_URL_MAX_LENGTH) return invalid();
  if (!/^[\x21-\x7e]+$/.test(value) || value.includes("\\")) return invalid();
  const match = /^https:\/\/([^/?#]+)([^?#]*)(?:\?[^#]*)?(?:#.*)?$/i.exec(
    value,
  );
  if (!match) return invalid();
  const authority = match[1].toLowerCase();
  if (authority.includes("@") || authority.includes(":")) return invalid();
  if (!INSTAGRAM_HOSTS.has(authority)) return invalid();
  const path = match[2];
  if (/%[0-9a-f]{2}/i.test(path)) return invalid();
  if (!path || path === "/") return [];
  if (!path.startsWith("/")) return invalid();
  const body = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = body.slice(1).split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return invalid();
  return segments;
}

/** Profile URL forms: `/<username>/` only, without reserved route segments. */
function usernameFromUrl(raw: unknown): string {
  const segments = instagramSegments(raw);
  if (segments.length !== 1) return invalid();
  if (RESERVED_PROFILE_SEGMENTS.has(segments[0].toLowerCase()))
    return invalid();
  return validUsername(segments[0]);
}

/** Post URL forms: `/(p|reel|reels)/<shortcode>/` or `/<username>/p/<shortcode>/`. */
function shortcodeFromUrl(raw: unknown): string {
  const segments = instagramSegments(raw);
  const shortcode = (candidate: string): string =>
    SHORTCODE_PATTERN.test(candidate) ? candidate : invalid();
  if (segments.length === 2 && POST_ROUTE_SEGMENTS.has(segments[0]))
    return shortcode(segments[1]);
  if (segments.length === 3 && segments[1] === "p") {
    validUsername(segments[0]);
    return shortcode(segments[2]);
  }
  return invalid();
}

function tiktokSegments(raw: unknown): string[] {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!value || value.length > SOCIAL_URL_MAX_LENGTH) return invalid();
  if (!/^[\x21-\x7e]+$/.test(value) || value.includes("\\")) return invalid();
  const match = /^https:\/\/([^/?#]+)([^?#]*)$/i.exec(value);
  if (!match) return invalid();
  const authority = match[1].toLowerCase();
  if (authority.includes("@") || authority.includes(":")) return invalid();
  if (!TIKTOK_HOSTS.has(authority)) return invalid();
  const path = match[2];
  if (/%[0-9a-f]{2}/i.test(path)) return invalid();
  if (!path || path === "/" || !path.startsWith("/")) return invalid();
  const body = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = body.slice(1).split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return invalid();
  return segments;
}

function tiktokUsernameFromUrl(raw: unknown): string {
  const segments = tiktokSegments(raw);
  if (segments.length !== 1 || !segments[0].startsWith("@")) return invalid();
  const username = segments[0].slice(1);
  if (TIKTOK_RESERVED.has(username.toLowerCase())) return invalid();
  return validUsername(username, "tiktok");
}

function tiktokPostFromUrl(raw: unknown): {
  username: string;
  video_id: string;
} {
  const segments = tiktokSegments(raw);
  if (
    segments.length !== 3 ||
    !segments[0].startsWith("@") ||
    segments[1] !== "video" ||
    !VIDEO_ID_PATTERN.test(segments[2])
  )
    return invalid();
  return {
    username: validUsername(segments[0].slice(1), "tiktok"),
    video_id: segments[2],
  };
}

function checkPlatform(platform: unknown): "instagram" | "tiktok" {
  if (platform === undefined || platform === "instagram") return "instagram";
  if (platform === "tiktok") return "tiktok";
  return invalid();
}

/** Mirror the tools' closed parameter schemas for direct client callers. */
function rejectUnknown(params: object, allowed: readonly string[]): void {
  if (Object.keys(params).some((key) => !allowed.includes(key))) invalid();
}

function profileSelector(
  params: { username?: unknown; url?: unknown },
  platform: "instagram" | "tiktok",
): Record<string, string> {
  const hasUsername = params.username !== undefined;
  const hasUrl = params.url !== undefined;
  if (hasUsername === hasUrl) return invalid();
  if (hasUsername)
    return { username: validUsername(params.username, platform) };
  const value = params.url;
  if (platform === "tiktok") tiktokUsernameFromUrl(value);
  else usernameFromUrl(value);
  return { url: String(value).trim() };
}

function postSelector(
  params: {
    shortcode?: unknown;
    video_id?: unknown;
    username?: unknown;
    url?: unknown;
  },
  platform: "instagram" | "tiktok",
): Record<string, string> {
  if (params.url !== undefined) {
    if (
      params.shortcode !== undefined ||
      params.video_id !== undefined ||
      params.username !== undefined
    )
      return invalid();
    if (platform === "tiktok") tiktokPostFromUrl(params.url);
    else shortcodeFromUrl(params.url);
    return { url: String(params.url).trim() };
  }
  if (platform === "tiktok") {
    if (params.shortcode !== undefined) return invalid();
    if (typeof params.video_id !== "string") return invalid();
    const video_id = params.video_id.trim();
    if (!VIDEO_ID_PATTERN.test(video_id)) return invalid();
    return { video_id, username: validUsername(params.username, "tiktok") };
  }
  if (params.video_id !== undefined || params.username !== undefined)
    return invalid();
  if (typeof params.shortcode !== "string") return invalid();
  const value = params.shortcode.trim();
  return { shortcode: SHORTCODE_PATTERN.test(value) ? value : invalid() };
}

function recordTimeout(raw: unknown): number {
  if (raw === undefined) return SOCIAL_DEFAULT_RECORD_TIMEOUT_MS;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < SOCIAL_RECORD_TIMEOUT_MIN_MS ||
    raw > SOCIAL_RECORD_TIMEOUT_MAX_MS
  )
    return invalid();
  return raw;
}

function sampleTimeout(raw: unknown): number {
  if (raw === undefined) return SOCIAL_DEFAULT_SAMPLE_TIMEOUT_MS;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < SOCIAL_RECORD_TIMEOUT_MIN_MS ||
    raw > SOCIAL_SAMPLE_TIMEOUT_MAX_MS
  )
    return invalid();
  return raw;
}

export function socialProfileRequest(
  params: SocialProfileParams,
): SocialRequest {
  rejectUnknown(params, ["platform", "username", "url", "timeout_ms"]);
  const platform = checkPlatform(params.platform);
  const timeout_ms = recordTimeout(params.timeout_ms);
  return {
    endpoint: "/v1/social/profile",
    body: {
      platform,
      ...profileSelector(params, platform),
      timeout_ms,
    },
    serverTimeoutMs: timeout_ms,
  };
}

export function socialProfilePostsRequest(
  params: SocialProfilePostsParams,
): SocialRequest {
  rejectUnknown(params, [
    "platform",
    "username",
    "url",
    "max_posts",
    "timeout_ms",
  ]);
  const platform = checkPlatform(params.platform);
  const timeout_ms = sampleTimeout(params.timeout_ms);
  const max_posts = params.max_posts ?? SOCIAL_DEFAULT_MAX_POSTS;
  if (
    !Number.isSafeInteger(max_posts) ||
    max_posts < 1 ||
    max_posts > SOCIAL_MAX_POSTS
  )
    invalid();
  return {
    endpoint: "/v1/social/profile-posts",
    body: {
      platform,
      ...profileSelector(params, platform),
      max_posts,
      timeout_ms,
    },
    serverTimeoutMs: timeout_ms,
  };
}

export function socialPostRequest(params: SocialPostParams): SocialRequest {
  rejectUnknown(params, [
    "platform",
    "shortcode",
    "video_id",
    "username",
    "url",
    "timeout_ms",
  ]);
  const platform = checkPlatform(params.platform);
  const timeout_ms = recordTimeout(params.timeout_ms);
  return {
    endpoint: "/v1/social/post",
    body: {
      platform,
      ...postSelector(params, platform),
      timeout_ms,
    },
    serverTimeoutMs: timeout_ms,
  };
}

function parseTimings(value: unknown): SocialTimings {
  if (
    !isRecord(value) ||
    !["queue_ms", "upstream_ms", "total_ms"].every((key) => isCount(value[key]))
  )
    return malformed();
  return value as unknown as SocialTimings;
}

function parseMediaRef(value: unknown): SocialMediaRef | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.url !== "string" ||
    !value.url ||
    !isDimension(value.width) ||
    !isDimension(value.height)
  )
    return malformed();
  return value as unknown as SocialMediaRef;
}

function parseProfile(value: unknown): SocialProfile {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.username !== "string" ||
    !USERNAME_PATTERN.test(value.username) ||
    typeof value.url !== "string" ||
    !isNullableText(value.full_name) ||
    !isNullableText(value.biography) ||
    !isNullableText(value.avatar_url) ||
    !(value.follower_count === null || isCount(value.follower_count)) ||
    !(value.following_count === null || isCount(value.following_count)) ||
    !(value.post_count === null || isCount(value.post_count)) ||
    !(
      value.total_like_count === undefined ||
      value.total_like_count === null ||
      isCount(value.total_like_count)
    ) ||
    typeof value.is_private !== "boolean" ||
    typeof value.is_verified !== "boolean" ||
    !Array.isArray(value.bio_links) ||
    value.bio_links.length > 10 ||
    !value.bio_links.every(
      (link: unknown) =>
        isRecord(link) &&
        typeof link.url === "string" &&
        isNullableText(link.title) &&
        isNullableText(link.type),
    )
  )
    return malformed();
  return value as unknown as SocialProfile;
}

function parseCarouselItem(value: unknown): SocialCarouselItem {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !["image", "video", "unknown"].includes(String(value.content_type))
  )
    return malformed();
  parseMediaRef(value.thumbnail);
  parseMediaRef(value.video);
  return value as unknown as SocialCarouselItem;
}

function parsePost(value: unknown): SocialPost {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !(
      value.shortcode === null ||
      (typeof value.shortcode === "string" &&
        SHORTCODE_PATTERN.test(value.shortcode))
    ) ||
    typeof value.url !== "string" ||
    !value.url ||
    !isRecord(value.author) ||
    typeof value.author.id !== "string" ||
    !value.author.id ||
    typeof value.author.username !== "string" ||
    !USERNAME_PATTERN.test(value.author.username) ||
    !Array.isArray(value.coauthors) ||
    value.coauthors.length > 10 ||
    !value.coauthors.every((name) => typeof name === "string") ||
    !isNullableText(value.caption) ||
    !isNullableText(value.accessibility_caption) ||
    !isUtcTimestamp(value.published_at) ||
    !["image", "video", "carousel", "unknown"].includes(
      String(value.content_type),
    ) ||
    !isNullableText(value.product_type) ||
    !(value.like_count === null || isCount(value.like_count)) ||
    !(value.comment_count === null || isCount(value.comment_count)) ||
    !(value.view_count === null || isCount(value.view_count)) ||
    !(value.play_count === null || isCount(value.play_count)) ||
    !(
      value.share_count === undefined ||
      value.share_count === null ||
      isCount(value.share_count)
    ) ||
    !(
      value.collect_count === undefined ||
      value.collect_count === null ||
      isCount(value.collect_count)
    ) ||
    !(
      value.like_counts_hidden === null ||
      typeof value.like_counts_hidden === "boolean"
    ) ||
    !(
      value.is_paid_partnership === null ||
      typeof value.is_paid_partnership === "boolean"
    ) ||
    !(
      value.is_ad === undefined ||
      value.is_ad === null ||
      typeof value.is_ad === "boolean"
    ) ||
    !(
      value.is_aigc === undefined ||
      value.is_aigc === null ||
      typeof value.is_aigc === "boolean"
    ) ||
    !(
      value.music === undefined ||
      value.music === null ||
      isRecord(value.music)
    ) ||
    !(
      value.hashtags === undefined ||
      (Array.isArray(value.hashtags) &&
        value.hashtags.length <= 20 &&
        value.hashtags.every(
          (tag) =>
            typeof tag === "string" && tag.length > 0 && tag.length <= 100,
        ))
    ) ||
    !Array.isArray(value.carousel) ||
    value.carousel.length > 20
  )
    return malformed();
  parseMediaRef(value.thumbnail);
  parseMediaRef(value.video);
  for (const item of value.carousel) parseCarouselItem(item);
  return value as unknown as SocialPost;
}

function parseStringList(value: unknown, max: number): string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    !value.every(
      (entry) =>
        typeof entry === "string" && entry.length > 0 && entry.length <= 64,
    ) ||
    new Set(value).size !== value.length
  )
    return malformed();
  return value as string[];
}

function parseFailedPost(value: unknown): SocialFailedPost {
  if (
    !isRecord(value) ||
    !(
      value.shortcode === null ||
      (typeof value.shortcode === "string" &&
        SHORTCODE_PATTERN.test(value.shortcode))
    ) ||
    !isErrorCode(value.error_code) ||
    !(value.reason === null || isReason(value.reason))
  )
    return malformed();
  return value as unknown as SocialFailedPost;
}

function parseSampleFailure(value: unknown): SocialSampleFailure | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !["listing", "hydration"].includes(String(value.stage)) ||
    !isErrorCode(value.error_code) ||
    value.error_code === SOCIAL_POST_NOT_FOUND ||
    !(value.reason === null || isReason(value.reason)) ||
    !(value.retry_after_s === null || isCount(value.retry_after_s))
  )
    return malformed();
  return value as unknown as SocialSampleFailure;
}

function checkEnvelope(data: unknown): Record<string, unknown> {
  if (
    !isRecord(data) ||
    typeof data.id !== "string" ||
    !data.id ||
    !["instagram", "tiktok"].includes(String(data.platform)) ||
    !isUtcTimestamp(data.observed_at)
  )
    return malformed();
  return data;
}

export function parseSocialProfileResponse(
  data: unknown,
): SocialProfileResponse {
  const envelope = checkEnvelope(data);
  parseProfile(envelope.profile);
  parseTimings(envelope.timings);
  if (envelope.warnings !== undefined) parseStringList(envelope.warnings, 10);
  return envelope as unknown as SocialProfileResponse;
}

export function parseSocialPostResponse(data: unknown): SocialPostResponse {
  const envelope = checkEnvelope(data);
  parsePost(envelope.post);
  parseTimings(envelope.timings);
  if (envelope.warnings !== undefined) parseStringList(envelope.warnings, 10);
  return envelope as unknown as SocialPostResponse;
}

export function parseSocialProfilePostsResponse(
  data: unknown,
): SocialProfilePostsResponse {
  const envelope = checkEnvelope(data);
  parseProfile(envelope.profile);
  parseTimings(envelope.timings);
  const posts = envelope.posts;
  const requested = envelope.requested_posts;
  const returned = envelope.returned_posts;
  const failed = envelope.failed_posts;
  if (
    !Array.isArray(posts) ||
    posts.length > SOCIAL_MAX_POSTS ||
    !Array.isArray(failed) ||
    !(
      typeof requested === "number" &&
      Number.isSafeInteger(requested) &&
      requested >= 1 &&
      requested <= SOCIAL_MAX_POSTS
    ) ||
    !(typeof returned === "number" && Number.isSafeInteger(returned)) ||
    returned !== posts.length ||
    returned > requested ||
    failed.length > requested ||
    (envelope.has_more_posts !== null &&
      typeof envelope.has_more_posts !== "boolean") ||
    typeof envelope.partial !== "boolean"
  )
    return malformed();
  posts.forEach(parsePost);
  const failedPosts = failed.map(parseFailedPost);
  const truncation = parseStringList(envelope.truncation, 10);
  parseStringList(envelope.warnings, 10);
  const sampleFailure = parseSampleFailure(envelope.sample_failure);
  const stopCategories = new Set([
    "deadline",
    "page_cap",
    "page_failure",
    "upstream_failure",
  ]);
  const expectedPartial =
    failedPosts.length > 0 ||
    sampleFailure !== null ||
    truncation.some((category) => stopCategories.has(category));
  if (envelope.partial !== expectedPartial) return malformed();
  return envelope as unknown as SocialProfilePostsResponse;
}
