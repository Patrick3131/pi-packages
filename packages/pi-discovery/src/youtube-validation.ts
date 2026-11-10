import { YoutubeClientError } from "./youtube-errors.js";
import {
  YOUTUBE_DEFAULT_MAX_CHARS,
  YOUTUBE_DEFAULT_TIMEOUT_MS,
  YOUTUBE_LANGUAGE,
  YOUTUBE_MAX_MAX_CHARS,
  YOUTUBE_MAX_RESULTS,
  YOUTUBE_MAX_TIMEOUT_MS,
  YOUTUBE_MAX_URL_LENGTH,
  YOUTUBE_MIN_MAX_CHARS,
  YOUTUBE_MIN_TIMEOUT_MS,
  YOUTUBE_VIDEO_ID,
  type YoutubeSearchItem,
  type YoutubeSearchParams,
  type YoutubeSearchResponse,
  type YoutubeTranscriptFormat,
  type YoutubeTranscriptParams,
  type YoutubeTranscriptResponse,
  type YoutubeTranscriptSegment,
} from "./youtube-types.js";

/** One validated wire request: route, exact body and effective server budget. */
export interface YoutubeRequest {
  endpoint: string;
  body: Record<string, unknown>;
  serverTimeoutMs: number;
  /** For URL selectors, the locally resolved id the response must match. */
  resolvedVideoId?: string;
  format?: YoutubeTranscriptFormat;
}

const invalid = (): never => {
  throw new YoutubeClientError("invalid_request");
};
const malformed = (): never => {
  throw new YoutubeClientError("malformed");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isNullableText = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

function rejectUnknown(params: object, allowed: readonly string[]): void {
  if (Object.keys(params).some((key) => !allowed.includes(key))) invalid();
}

function timeout(raw: unknown): number {
  if (raw === undefined) return YOUTUBE_DEFAULT_TIMEOUT_MS;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < YOUTUBE_MIN_TIMEOUT_MS ||
    raw > YOUTUBE_MAX_TIMEOUT_MS
  )
    return invalid();
  return raw;
}

function language(raw: unknown): string {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!YOUTUBE_LANGUAGE.test(value)) return invalid();
  return value;
}

function maxResults(raw: unknown): number {
  if (raw === undefined) return YOUTUBE_MAX_RESULTS;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < 1 ||
    raw > YOUTUBE_MAX_RESULTS
  )
    return invalid();
  return raw;
}

function maxChars(raw: unknown): number {
  if (raw === undefined) return YOUTUBE_DEFAULT_MAX_CHARS;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < YOUTUBE_MIN_MAX_CHARS ||
    raw > YOUTUBE_MAX_MAX_CHARS
  )
    return invalid();
  return raw;
}

/**
 * Mirror the service's URL resolution before sending a selector: http(s) only,
 * YouTube hosts, no userinfo/port tricks, and exactly one video id. The service
 * remains authoritative; this prevents an invalid/malicious URL from being
 * dispatched and gives the client the id needed to validate the response.
 */
export function youtubeVideoIdFromUrl(raw: unknown): string {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!value || value.length > YOUTUBE_MAX_URL_LENGTH) return invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    return invalid();
  if (url.port && !["80", "443"].includes(url.port)) return invalid();
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = singlePathId(url.pathname, "/");
  } else if (
    ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(
      host,
    )
  ) {
    if (url.pathname === "/watch" || url.pathname === "/watch/") {
      const values = url.searchParams.getAll("v");
      if (values.length !== 1) return invalid();
      candidate = values[0];
    } else if (url.pathname.startsWith("/shorts/")) {
      candidate = singlePathId(url.pathname, "/shorts/");
    } else if (url.pathname.startsWith("/embed/")) {
      candidate = singlePathId(url.pathname, "/embed/");
    }
  }
  if (!candidate || !YOUTUBE_VIDEO_ID.test(candidate)) return invalid();
  return candidate;
}

function singlePathId(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  let candidate = path.slice(prefix.length);
  if (candidate.endsWith("/")) candidate = candidate.slice(0, -1);
  if (!candidate || candidate.includes("/")) return null;
  return candidate;
}

export function youtubeSearchRequest(params: YoutubeSearchParams): YoutubeRequest {
  rejectUnknown(params, ["query", "max_results", "language", "region", "timeout_ms"]);
  if (typeof params.query !== "string") return invalid();
  const query = params.query.trim();
  if (!query || query.length > 200) return invalid();
  if (params.region !== undefined && typeof params.region !== "string")
    return invalid();
  const region = (params.region ?? "US").trim();
  if (!/^[A-Za-z]{2}$/.test(region)) return invalid();
  const effectiveTimeout = timeout(params.timeout_ms);
  return {
    endpoint: "/v1/youtube/search",
    body: {
      query,
      max_results: maxResults(params.max_results),
      language: params.language === undefined ? "en" : language(params.language),
      region: region.toUpperCase(),
      timeout_ms: effectiveTimeout,
    },
    serverTimeoutMs: effectiveTimeout,
  };
}

export function youtubeTranscriptRequest(
  params: YoutubeTranscriptParams,
): YoutubeRequest {
  rejectUnknown(params, [
    "video_id",
    "url",
    "language",
    "format",
    "max_chars",
    "timeout_ms",
  ]);
  const hasId = params.video_id !== undefined;
  const hasUrl = params.url !== undefined;
  if (hasId === hasUrl) return invalid();
  let videoId: string;
  const selector: Record<string, string> = {};
  if (hasId) {
    if (typeof params.video_id !== "string") return invalid();
    videoId = params.video_id.trim();
    if (!YOUTUBE_VIDEO_ID.test(videoId)) return invalid();
    selector.video_id = videoId;
  } else {
    if (typeof params.url !== "string") return invalid();
    videoId = youtubeVideoIdFromUrl(params.url);
    selector.url = params.url.trim();
  }
  const format = params.format ?? "segments";
  if (format !== "segments" && format !== "text") return invalid();
  const effectiveTimeout = timeout(params.timeout_ms);
  const body: Record<string, unknown> = {
    ...selector,
    format,
    max_chars: maxChars(params.max_chars),
    timeout_ms: effectiveTimeout,
  };
  if (params.language !== undefined)
    body.language = language(params.language);
  return {
    endpoint: "/v1/youtube/transcript",
    body,
    serverTimeoutMs: effectiveTimeout,
    resolvedVideoId: videoId,
    format,
  };
}

function parseSearchItem(value: unknown): YoutubeSearchItem {
  if (
    !isRecord(value) ||
    typeof value.video_id !== "string" ||
    !YOUTUBE_VIDEO_ID.test(value.video_id) ||
    typeof value.url !== "string" ||
    value.url !== `https://www.youtube.com/watch?v=${value.video_id}` ||
    typeof value.title !== "string" ||
    !value.title ||
    value.title.length > 1000 ||
    typeof value.channel !== "string" ||
    value.channel.length > 1000 ||
    !(value.channel_id === null || typeof value.channel_id === "string") ||
    !(value.duration_s === null || isCount(value.duration_s)) ||
    !isNullableText(value.published_text) ||
    (value.published_text !== null && value.published_text.length > 100) ||
    !(value.view_count === null || isCount(value.view_count)) ||
    typeof value.live !== "boolean" ||
    typeof value.has_captions !== "boolean" ||
    typeof value.thumbnail_url !== "string" ||
    value.thumbnail_url !==
      `https://i.ytimg.com/vi/${value.video_id}/hqdefault.jpg`
  )
    return malformed();
  return value as unknown as YoutubeSearchItem;
}

export function parseYoutubeSearchResponse(
  data: unknown,
  maxResults: number = YOUTUBE_MAX_RESULTS,
): YoutubeSearchResponse {
  if (
    !isRecord(data) ||
    typeof data.query !== "string" ||
    !data.query ||
    data.query.length > 200 ||
    !isCount(data.estimated_results) ||
    !Array.isArray(data.results) ||
    data.results.length > maxResults ||
    new Set(
      data.results
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item) => item.video_id),
    ).size !== data.results.length
  )
    return malformed();
  data.results.forEach(parseSearchItem);
  return data as unknown as YoutubeSearchResponse;
}

function parseSegment(value: unknown): YoutubeTranscriptSegment {
  if (
    !isRecord(value) ||
    !isCount(value.start_ms) ||
    !isCount(value.duration_ms) ||
    typeof value.text !== "string" ||
    value.text.length > 100000
  )
    return malformed();
  return value as unknown as YoutubeTranscriptSegment;
}

export function parseYoutubeTranscriptResponse(
  data: unknown,
  expectation: Pick<YoutubeRequest, "resolvedVideoId" | "format"> = {},
): YoutubeTranscriptResponse {
  if (
    !isRecord(data) ||
    typeof data.video_id !== "string" ||
    !YOUTUBE_VIDEO_ID.test(data.video_id) ||
    (expectation.resolvedVideoId !== undefined &&
      data.video_id !== expectation.resolvedVideoId) ||
    typeof data.title !== "string" ||
    !data.title ||
    data.title.length > 1000 ||
    typeof data.channel !== "string" ||
    data.channel.length > 1000 ||
    !(data.channel_id === null || typeof data.channel_id === "string") ||
    !(data.duration_s === null || isCount(data.duration_s)) ||
    typeof data.language !== "string" ||
    !YOUTUBE_LANGUAGE.test(data.language) ||
    !["manual", "asr"].includes(String(data.language_kind)) ||
    !Array.isArray(data.available_languages) ||
    data.available_languages.length > 100 ||
    !data.available_languages.every(
      (entry) => typeof entry === "string" && YOUTUBE_LANGUAGE.test(entry),
    ) ||
    new Set(data.available_languages).size !== data.available_languages.length ||
    !Array.isArray(data.segments) ||
    data.segments.length > 20000 ||
    !isNullableText(data.text) ||
    (data.text !== null && data.text.length > YOUTUBE_MAX_MAX_CHARS) ||
    typeof data.truncated !== "boolean" ||
    typeof data.cached !== "boolean"
  )
    return malformed();
  data.segments.forEach(parseSegment);
  // A successful transcript has exactly one rendering: the segment list or text.
  if ((data.segments.length > 0) === (data.text !== null)) return malformed();
  if (
    expectation.format === "segments" &&
    (data.segments.length === 0 || data.text !== null)
  )
    return malformed();
  if (expectation.format === "text" && (data.text === null || data.segments.length !== 0))
    return malformed();
  return data as unknown as YoutubeTranscriptResponse;
}

