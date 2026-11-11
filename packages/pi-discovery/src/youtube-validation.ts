import { YoutubeClientError } from "./youtube-errors.js";
import {
  YOUTUBE_CHANNEL_ID,
  YOUTUBE_CHANNEL_VIDEOS,
  YOUTUBE_CURSOR,
  YOUTUBE_DEFAULT_MAX_CHARS,
  YOUTUBE_DESCRIPTION_CAP,
  YOUTUBE_LIVE_STATUSES,
  YOUTUBE_MAX_TAGS,
  YOUTUBE_MAX_TAG_CHARS,
  YOUTUBE_MAX_TAGS_TOTAL,
  YOUTUBE_DEFAULT_TIMEOUT_MS,
  YOUTUBE_HANDLE,
  YOUTUBE_LANGUAGE,
  YOUTUBE_MAX_CURSOR,
  YOUTUBE_MAX_MAX_CHARS,
  YOUTUBE_MAX_RESULTS,
  YOUTUBE_MAX_TIMEOUT_MS,
  YOUTUBE_MAX_URL_LENGTH,
  YOUTUBE_MIN_MAX_CHARS,
  YOUTUBE_MIN_TIMEOUT_MS,
  YOUTUBE_VIDEO_ID,
  type YoutubeAbout,
  type YoutubeChannel,
  type YoutubeChannelParams,
  type YoutubeChannelResponse,
  type YoutubeChannelVideo,
  type YoutubeVideoMetadata,
  type YoutubeVideoParams,
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

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

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
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return invalid();
  if (url.port && !["80", "443"].includes(url.port)) return invalid();
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = singlePathId(url.pathname, "/");
  } else if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ].includes(host)
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

export function youtubeSearchRequest(
  params: YoutubeSearchParams,
): YoutubeRequest {
  rejectUnknown(params, [
    "query",
    "max_results",
    "language",
    "region",
    "timeout_ms",
  ]);
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
      language:
        params.language === undefined ? "en" : language(params.language),
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
    "start_ms",
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
  if (
    params.start_ms !== undefined &&
    (typeof params.start_ms !== "number" ||
      !Number.isSafeInteger(params.start_ms) ||
      params.start_ms < 0 ||
      params.start_ms > 86_400_000)
  )
    return invalid();
  const effectiveTimeout = timeout(params.timeout_ms);
  const body: Record<string, unknown> = {
    ...selector,
    format,
    max_chars: maxChars(params.max_chars),
    timeout_ms: effectiveTimeout,
  };
  if (params.start_ms !== undefined) body.start_ms = params.start_ms;
  if (params.language !== undefined) body.language = language(params.language);
  return {
    endpoint: "/v1/youtube/transcript",
    body,
    serverTimeoutMs: effectiveTimeout,
    resolvedVideoId: videoId,
    format,
  };
}

function channelTargetFromUrl(raw: unknown): { url: string } {
  if (typeof raw !== "string") return invalid();
  const value = raw.trim();
  if (!value || value.length > YOUTUBE_MAX_URL_LENGTH) return invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return invalid();
  if (url.port && !["80", "443"].includes(url.port)) return invalid();
  if (url.search || url.hash) return invalid();
  if (
    !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
      url.hostname.toLowerCase(),
    )
  )
    return invalid();
  let path = url.pathname;
  if (path.endsWith("/")) path = path.slice(0, -1);
  if (path.endsWith("/videos")) path = path.slice(0, -"/videos".length);
  if (
    !path.startsWith("/") ||
    path.includes("//") ||
    /%2f/i.test(path) ||
    /\/(?:\.{1,2})(?:\/|$)/.test(path)
  )
    return invalid();
  const parts = path.split("/").slice(1);
  if (parts.some((part) => !part || part === "." || part === ".."))
    return invalid();
  if (path.startsWith("/@")) {
    const handle = path.slice(1);
    if (!YOUTUBE_HANDLE.test(handle)) return invalid();
    return { url: `https://www.youtube.com/${handle}` };
  }
  if (path.startsWith("/channel/")) {
    if (!YOUTUBE_CHANNEL_ID.test(path.slice("/channel/".length)))
      return invalid();
    return { url: `https://www.youtube.com${path}` };
  }
  if (path.startsWith("/c/") || path.startsWith("/user/")) {
    const prefix = path.startsWith("/c/") ? "/c/" : "/user/";
    const name = path.slice(prefix.length);
    if (!name || name.includes("/") || name === "." || name === "..")
      return invalid();
    return { url: `https://www.youtube.com${path}` };
  }
  return invalid();
}

export function youtubeChannelRequest(
  params: YoutubeChannelParams,
): YoutubeRequest {
  rejectUnknown(params, [
    "channel_id",
    "handle",
    "url",
    "cursor",
    "language",
    "region",
    "timeout_ms",
  ]);
  const hasCursor = params.cursor !== undefined;
  const body: Record<string, unknown> = {};
  if (hasCursor) {
    if (
      typeof params.cursor !== "string" ||
      !YOUTUBE_CURSOR.test(params.cursor) ||
      params.cursor.length > YOUTUBE_MAX_CURSOR
    )
      return invalid();
    if (
      params.handle !== undefined ||
      params.url !== undefined ||
      typeof params.channel_id !== "string" ||
      !YOUTUBE_CHANNEL_ID.test(params.channel_id)
    )
      return invalid();
    body.channel_id = params.channel_id;
    body.cursor = params.cursor;
  } else {
    const count = [params.channel_id, params.handle, params.url].filter(
      (value) => value !== undefined,
    ).length;
    if (count !== 1) return invalid();
    if (params.channel_id !== undefined) {
      if (
        typeof params.channel_id !== "string" ||
        !YOUTUBE_CHANNEL_ID.test(params.channel_id)
      )
        return invalid();
      body.channel_id = params.channel_id;
    } else if (params.handle !== undefined) {
      if (
        typeof params.handle !== "string" ||
        !YOUTUBE_HANDLE.test(params.handle)
      )
        return invalid();
      body.handle = params.handle;
    } else {
      body.url = channelTargetFromUrl(params.url).url;
    }
  }
  if (params.region !== undefined && typeof params.region !== "string")
    return invalid();
  const region = (params.region ?? "US").trim();
  if (!/^[A-Za-z]{2}$/.test(region)) return invalid();
  const effectiveTimeout = timeout(params.timeout_ms);
  body.language =
    params.language === undefined ? "en" : language(params.language);
  body.region = region.toUpperCase();
  body.timeout_ms = effectiveTimeout;
  return {
    endpoint: "/v1/youtube/channel",
    body,
    serverTimeoutMs: effectiveTimeout,
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
    !(
      typeof value.captions_advertised === "boolean" ||
      typeof value.has_captions === "boolean"
    ) ||
    typeof value.thumbnail_url !== "string" ||
    value.thumbnail_url !==
      `https://i.ytimg.com/vi/${value.video_id}/hqdefault.jpg`
  )
    return malformed();
  const captions =
    typeof value.captions_advertised === "boolean"
      ? value.captions_advertised
      : (value.has_captions as boolean);
  return {
    ...value,
    captions_advertised: captions,
  } as unknown as YoutubeSearchItem;
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
  const results = data.results.map(parseSearchItem);
  return { ...data, results } as unknown as YoutubeSearchResponse;
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
    new Set(data.available_languages).size !==
      data.available_languages.length ||
    !Array.isArray(data.segments) ||
    data.segments.length > 20000 ||
    !isNullableText(data.text) ||
    (data.text !== null && data.text.length > YOUTUBE_MAX_MAX_CHARS) ||
    typeof data.truncated !== "boolean" ||
    typeof data.cached !== "boolean" ||
    (data.window_start_ms !== undefined &&
      data.window_start_ms !== null &&
      !isCount(data.window_start_ms)) ||
    (data.next_start_ms !== undefined &&
      data.next_start_ms !== null &&
      !isCount(data.next_start_ms)) ||
    (data.total_chars !== undefined && !isCount(data.total_chars)) ||
    (data.returned_chars !== undefined && !isCount(data.returned_chars))
  )
    return malformed();
  data.segments.forEach(parseSegment);
  if (data.text !== null && data.segments.length !== 0) return malformed();
  if (expectation.format === "segments" && data.text !== null)
    return malformed();
  if (
    expectation.format === "text" &&
    (data.text === null || data.segments.length !== 0)
  )
    return malformed();
  const rendered =
    data.text === null
      ? data.segments.reduce(
          (total: number, segment: Record<string, unknown>, index: number) =>
            total + (segment.text as string).length + (index > 0 ? 1 : 0),
          0,
        )
      : data.text.length;
  if (data.returned_chars !== undefined && data.returned_chars !== rendered)
    return malformed();
  if (
    data.total_chars !== undefined &&
    data.returned_chars !== undefined &&
    data.total_chars < data.returned_chars
  )
    return malformed();
  return data as unknown as YoutubeTranscriptResponse;
}

function parseChannelVideo(value: unknown): YoutubeChannelVideo {
  if (
    !isRecord(value) ||
    typeof value.video_id !== "string" ||
    !YOUTUBE_VIDEO_ID.test(value.video_id) ||
    value.url !== `https://www.youtube.com/watch?v=${value.video_id}` ||
    typeof value.title !== "string" ||
    value.title.length > 1000 ||
    !(value.duration_s === null || isCount(value.duration_s)) ||
    !isNullableText(value.published_text) ||
    (value.published_text !== null && value.published_text.length > 100) ||
    !(
      value.published_at === undefined ||
      value.published_at === null ||
      (typeof value.published_at === "string" &&
        ISO_UTC.test(value.published_at))
    ) ||
    !(value.view_count === null || isCount(value.view_count)) ||
    typeof value.live !== "boolean" ||
    value.thumbnail_url !==
      `https://i.ytimg.com/vi/${value.video_id}/hqdefault.jpg`
  )
    return malformed();
  return value as unknown as YoutubeChannelVideo;
}

function parseAboutLink(value: unknown): { title: string; url: string } {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    value.title.length > 80 ||
    typeof value.url !== "string" ||
    value.url.length > YOUTUBE_MAX_URL_LENGTH
  )
    return malformed();
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return malformed();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return malformed();
  return { title: value.title, url: value.url };
}

function parseAbout(value: unknown): YoutubeAbout {
  if (
    !isRecord(value) ||
    typeof value.description !== "string" ||
    value.description.length > 10000 ||
    !(value.view_count === null || isCount(value.view_count)) ||
    !isNullableText(value.view_count_text) ||
    !isNullableText(value.joined_text) ||
    !Array.isArray(value.links) ||
    value.links.length > 8
  )
    return malformed();
  value.links.forEach(parseAboutLink);
  return value as unknown as YoutubeAbout;
}

function parseChannel(value: unknown): YoutubeChannel {
  if (
    !isRecord(value) ||
    typeof value.channel_id !== "string" ||
    !YOUTUBE_CHANNEL_ID.test(value.channel_id) ||
    !(
      value.handle === null ||
      (typeof value.handle === "string" && YOUTUBE_HANDLE.test(value.handle))
    ) ||
    !isNullableText(value.title) ||
    (value.title !== null && value.title.length > 1000) ||
    !(value.subscriber_count === null || isCount(value.subscriber_count)) ||
    !isNullableText(value.subscriber_count_text) ||
    !(value.video_count === null || isCount(value.video_count)) ||
    typeof value.canonical_url !== "string" ||
    !value.canonical_url.startsWith("https://www.youtube.com/") ||
    value.canonical_url.length > YOUTUBE_MAX_URL_LENGTH ||
    !(
      value.avatar_url === null ||
      (typeof value.avatar_url === "string" &&
        value.avatar_url.length <= YOUTUBE_MAX_URL_LENGTH)
    )
  )
    return malformed();
  return value as unknown as YoutubeChannel;
}

export function parseYoutubeChannelResponse(
  data: unknown,
): YoutubeChannelResponse {
  if (
    !isRecord(data) ||
    !isRecord(data.channel) ||
    !Array.isArray(data.videos) ||
    data.videos.length > YOUTUBE_CHANNEL_VIDEOS ||
    !(data.about === null || isRecord(data.about)) ||
    !(data.next_cursor === null || typeof data.next_cursor === "string") ||
    (typeof data.next_cursor === "string" &&
      (data.next_cursor.length > YOUTUBE_MAX_CURSOR ||
        !YOUTUBE_CURSOR.test(data.next_cursor))) ||
    typeof data.has_more !== "boolean" ||
    data.has_more !== (data.next_cursor !== null) ||
    typeof data.cursor_overflow !== "boolean" ||
    typeof data.cached !== "boolean"
  )
    return malformed();
  parseChannel(data.channel);
  if (data.about !== null) parseAbout(data.about);
  data.videos.forEach(parseChannelVideo);
  if (
    new Set(data.videos.map((item) => item.video_id)).size !==
    data.videos.length
  )
    return malformed();
  return data as unknown as YoutubeChannelResponse;
}

export function youtubeVideoRequest(
  params: YoutubeVideoParams,
): YoutubeRequest {
  rejectUnknown(params, ["video_id", "url", "timeout_ms"]);
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
  const effectiveTimeout = timeout(params.timeout_ms);
  return {
    endpoint: "/v1/youtube/video",
    body: { ...selector, timeout_ms: effectiveTimeout },
    serverTimeoutMs: effectiveTimeout,
    resolvedVideoId: videoId,
  };
}

function parseVideoMetadata(value: unknown): YoutubeVideoMetadata {
  if (
    !isRecord(value) ||
    typeof value.video_id !== "string" ||
    !YOUTUBE_VIDEO_ID.test(value.video_id) ||
    value.url !== `https://www.youtube.com/watch?v=${value.video_id}` ||
    typeof value.title !== "string" ||
    value.title.length > 1000 ||
    typeof value.channel !== "string" ||
    value.channel.length > 1000 ||
    !(value.channel_id === null || typeof value.channel_id === "string") ||
    typeof value.description !== "string" ||
    value.description.length > YOUTUBE_DESCRIPTION_CAP ||
    typeof value.description_truncated !== "boolean" ||
    typeof value.published_at !== "string" ||
    !ISO_UTC.test(value.published_at) ||
    !(value.duration_s === null || isCount(value.duration_s)) ||
    !(value.view_count === null || isCount(value.view_count)) ||
    !(value.like_count === null || isCount(value.like_count)) ||
    !(value.comment_count === null || isCount(value.comment_count)) ||
    typeof value.live !== "boolean" ||
    !YOUTUBE_LIVE_STATUSES.includes(
      value.live_status as (typeof YOUTUBE_LIVE_STATUSES)[number],
    ) ||
    value.live !== (value.live_status === "live") ||
    !Array.isArray(value.tags) ||
    value.tags.length > YOUTUBE_MAX_TAGS ||
    !value.tags.every(
      (tag) =>
        typeof tag === "string" &&
        tag.length > 0 &&
        tag.length <= YOUTUBE_MAX_TAG_CHARS,
    ) ||
    value.tags.reduce((total: number, tag: string) => total + tag.length, 0) >
      YOUTUBE_MAX_TAGS_TOTAL ||
    typeof value.tags_truncated !== "boolean" ||
    !(value.category_id === null || typeof value.category_id === "string") ||
    value.thumbnail_url !==
      `https://i.ytimg.com/vi/${value.video_id}/hqdefault.jpg` ||
    typeof value.cached !== "boolean" ||
    value.source !== "youtube_data_api"
  )
    return malformed();
  return value as unknown as YoutubeVideoMetadata;
}

export function parseYoutubeVideoResponse(
  data: unknown,
  resolvedVideoId?: string,
): YoutubeVideoMetadata {
  const record = parseVideoMetadata(data);
  if (resolvedVideoId !== undefined && record.video_id !== resolvedVideoId)
    return malformed();
  return record;
}
