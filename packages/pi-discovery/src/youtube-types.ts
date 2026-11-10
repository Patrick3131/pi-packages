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
]);

export const YOUTUBE_NOT_FOUND_CODES = new Set([
  "youtube_no_captions",
  "youtube_unavailable",
]);

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const YOUTUBE_LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
export const YOUTUBE_MAX_RESULTS = 20;
export const YOUTUBE_MAX_URL_LENGTH = 2048;
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
  has_captions: boolean;
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
