/**
 * Wire contract for the Discovery YouTube routes. Field names stay snake_case so
 * structured output matches the API exactly.
 */

export type YoutubeLanguageKind = "manual" | "asr";
export type YoutubeTranscriptFormat = "segments" | "text";
export type YoutubeResultStatus = "ok" | "not_found" | "error";

/** Sanitized house error codes emitted by the YouTube routes. */
export const YOUTUBE_SERVER_CODES = new Set([
  "youtube_invalid_request",
  "youtube_disabled",
  "youtube_no_captions",
  "youtube_unavailable",
  "youtube_queue_full",
  "youtube_blocked",
  "youtube_upstream",
  "youtube_timeout",
  "youtube_channel_not_found",
]);

export const YOUTUBE_NOT_FOUND_CODES = new Set([
  "youtube_no_captions",
  "youtube_unavailable",
  "youtube_channel_not_found",
]);

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const YOUTUBE_LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
export const YOUTUBE_MAX_RESULTS = 20;
export const YOUTUBE_MAX_URL_LENGTH = 2048;
export const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
export const YOUTUBE_HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;
export const YOUTUBE_CURSOR = /^[A-Za-z0-9_%=+./-]+$/;
export const YOUTUBE_MAX_CURSOR = 8192;
export const YOUTUBE_CHANNEL_VIDEOS = 30;
export const YOUTUBE_MIN_TIMEOUT_MS = 5000;
export const YOUTUBE_MAX_TIMEOUT_MS = 30000;
export const YOUTUBE_DEFAULT_TIMEOUT_MS = 30000;
export const YOUTUBE_MIN_MAX_CHARS = 1000;
export const YOUTUBE_MAX_MAX_CHARS = 300000;
export const YOUTUBE_DEFAULT_MAX_CHARS = 200000;
/** Client HTTP budget beyond the effective server budget. */
export const YOUTUBE_HTTP_TIMEOUT_MARGIN_MS = 10000;

export interface YoutubeSearchItem {
  video_id: string;
  url: string;
  title: string;
  channel: string;
  channel_id: string | null;
  duration_s: number | null;
  published_text: string | null;
  view_count: number | null;
  live: boolean;
  has_captions?: boolean;
  captions_advertised?: boolean;
  thumbnail_url: string;
  [key: string]: unknown;
}

export interface YoutubeSearchResponse {
  query: string;
  estimated_results: number;
  results: YoutubeSearchItem[];
  [key: string]: unknown;
}

export interface YoutubeTranscriptSegment {
  start_ms: number;
  duration_ms: number;
  text: string;
  [key: string]: unknown;
}

export interface YoutubeTranscriptResponse {
  video_id: string;
  title: string;
  channel: string;
  channel_id: string | null;
  duration_s: number | null;
  language: string;
  language_kind: YoutubeLanguageKind;
  available_languages: string[];
  segments: YoutubeTranscriptSegment[];
  text: string | null;
  truncated: boolean;
  cached: boolean;
  window_start_ms?: number | null;
  next_start_ms?: number | null;
  total_chars?: number;
  returned_chars?: number;
  [key: string]: unknown;
}

export interface YoutubeSearchParams {
  query: string;
  max_results?: number;
  language?: string;
  region?: string;
  timeout_ms?: number;
}

export interface YoutubeTranscriptParams {
  video_id?: string;
  url?: string;
  language?: string;
  format?: YoutubeTranscriptFormat;
  max_chars?: number;
  start_ms?: number;
  timeout_ms?: number;
}

export interface YoutubeClientOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

/** Typed result envelope shared by `structuredContent` and `details`. */
export interface YoutubeResultEnvelope<R> {
  status: YoutubeResultStatus;
  requestId?: string;
  response?: R;
  error?: YoutubeResultError;
}

export interface YoutubeResultError {
  code: string;
  status?: number;
  serverCode?: string;
  requestId?: string;
  retryAfterMs?: number;
  reason?: string;
}

export interface YoutubeAboutLink {
  title: string;
  url: string;
  [key: string]: unknown;
}

export interface YoutubeAbout {
  description: string;
  view_count: number | null;
  view_count_text: string | null;
  joined_text: string | null;
  links: YoutubeAboutLink[];
  [key: string]: unknown;
}

export interface YoutubeChannelVideo {
  video_id: string;
  url: string;
  title: string;
  duration_s: number | null;
  published_text: string | null;
  view_count: number | null;
  live: boolean;
  thumbnail_url: string;
  [key: string]: unknown;
}

export interface YoutubeChannel {
  channel_id: string;
  handle: string | null;
  title: string | null;
  subscriber_count: number | null;
  subscriber_count_text: string | null;
  video_count: number | null;
  canonical_url: string;
  avatar_url: string | null;
  [key: string]: unknown;
}

export interface YoutubeChannelResponse {
  channel: YoutubeChannel;
  about: YoutubeAbout | null;
  videos: YoutubeChannelVideo[];
  next_cursor: string | null;
  has_more: boolean;
  cursor_overflow: boolean;
  cached: boolean;
  [key: string]: unknown;
}

export interface YoutubeChannelParams {
  channel_id?: string;
  handle?: string;
  url?: string;
  cursor?: string;
  language?: string;
  region?: string;
  timeout_ms?: number;
}
