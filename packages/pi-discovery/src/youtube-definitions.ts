import { Type, type TSchema } from "typebox";
import {
  YOUTUBE_DEFAULT_MAX_CHARS,
  YOUTUBE_MAX_MAX_CHARS,
  YOUTUBE_MAX_RESULTS,
  YOUTUBE_MAX_TIMEOUT_MS,
  YOUTUBE_MAX_URL_LENGTH,
  YOUTUBE_MIN_MAX_CHARS,
  YOUTUBE_MIN_TIMEOUT_MS,
} from "./youtube-types.js";

const nullableText = Type.Union([Type.String(), Type.Null()]);
const nullableCount = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
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
const resultEnvelope = (response: TSchema) =>
  Type.Object(
    {
      status: Type.Union([
        Type.Literal("ok"),
        Type.Literal("not_found"),
        Type.Literal("error"),
      ]),
      requestId: Type.Optional(Type.String()),
      response: Type.Optional(response),
      error: Type.Optional(errorSchema),
    },
    { additionalProperties: false },
  );

const searchItemSchema = Type.Object(
  {
    video_id: Type.String(),
    url: Type.String(),
    title: Type.String(),
    channel: Type.String(),
    channel_id: nullableText,
    duration_s: nullableCount,
    published_text: nullableText,
    view_count: nullableCount,
    live: Type.Boolean(),
    has_captions: Type.Boolean(),
    thumbnail_url: Type.String(),
  },
  { additionalProperties: true },
);
const searchResponseSchema = Type.Object(
  {
    query: Type.String(),
    estimated_results: Type.Integer({ minimum: 0 }),
    results: Type.Array(searchItemSchema, { maxItems: YOUTUBE_MAX_RESULTS }),
  },
  { additionalProperties: true },
);
const transcriptSegmentSchema = Type.Object(
  {
    start_ms: Type.Integer({ minimum: 0 }),
    duration_ms: Type.Integer({ minimum: 0 }),
    text: Type.String(),
  },
  { additionalProperties: true },
);
const transcriptResponseSchema = Type.Object(
  {
    video_id: Type.String(),
    title: Type.String(),
    channel: Type.String(),
    channel_id: nullableText,
    duration_s: nullableCount,
    language: Type.String(),
    language_kind: Type.Union([Type.Literal("manual"), Type.Literal("asr")]),
    available_languages: Type.Array(Type.String(), { maxItems: 100 }),
    segments: Type.Array(transcriptSegmentSchema, { maxItems: 20000 }),
    text: nullableText,
    truncated: Type.Boolean(),
    cached: Type.Boolean(),
  },
  { additionalProperties: true },
);

const timeoutField = Type.Optional(
  Type.Integer({
    minimum: YOUTUBE_MIN_TIMEOUT_MS,
    maximum: YOUTUBE_MAX_TIMEOUT_MS,
    description: "Server acquisition budget in milliseconds, including queue time. Default: 30000.",
  }),
);
const languageField = Type.Optional(
  Type.String({
    pattern: "^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$",
    description: "Language tag, for example en, de or pt-BR. Transcripts default to auto.",
  }),
);
const maxCharsField = Type.Optional(
  Type.Integer({
    minimum: YOUTUBE_MIN_MAX_CHARS,
    maximum: YOUTUBE_MAX_MAX_CHARS,
    default: YOUTUBE_DEFAULT_MAX_CHARS,
    description: `Maximum returned transcript characters (${YOUTUBE_MIN_MAX_CHARS}-${YOUTUBE_MAX_MAX_CHARS}). Default: ${YOUTUBE_DEFAULT_MAX_CHARS}.`,
  }),
);
const formatField = Type.Optional(
  Type.Union([Type.Literal("segments"), Type.Literal("text")], {
    default: "segments",
    description: "Return timed segments (default) or one joined text block.",
  }),
);
const videoIdField = Type.String({
  pattern: "^[A-Za-z0-9_-]{11}$",
  minLength: 11,
  maxLength: 11,
  description: "Exact YouTube video id.",
});
const videoUrlField = Type.String({
  minLength: 1,
  maxLength: YOUTUBE_MAX_URL_LENGTH,
  description: "YouTube watch, shorts, embed or youtu.be URL.",
});

export const youtubeSearchDefinition = {
  name: "youtube_search",
  label: "YouTube search",
  description:
    "Search public YouTube videos through the discovery service. Returns one provider page of up to 20 typed videos (id, URL, title, channel, duration, views, live flag and caption badge). There is no continuation in this tool: change the query instead of expecting a next page. has_captions is advisory, not a transcript guarantee. One server call; no client retry.",
  promptSnippet: "youtube_search(query, max_results): one page of public videos",
  promptGuidelines: [
    "Use youtube_search for video discovery, then youtube_transcript for one selected video.",
    "The result is one bounded provider page; do not imply that it is the complete result set.",
    "has_captions is a badge, not proof that a transcript fetch will succeed.",
  ],
  outputSchema: resultEnvelope(searchResponseSchema),
  parameters: Type.Object(
    {
      query: Type.String({ minLength: 1, maxLength: 200 }),
      max_results: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: YOUTUBE_MAX_RESULTS,
          default: YOUTUBE_MAX_RESULTS,
        }),
      ),
      language: languageField,
      region: Type.Optional(
        Type.String({
          pattern: "^[A-Za-z]{2}$",
          default: "US",
          description: "Two-letter region used for search ranking.",
        }),
      ),
      timeout_ms: timeoutField,
    },
    { additionalProperties: false },
  ),
};

export const youtubeTranscriptDefinition = {
  name: "youtube_transcript",
  label: "YouTube transcript",
  description:
    "Fetch the public transcript of one YouTube video. Supply exactly one video_id or YouTube URL; optional language prefers a manual track, then ASR. Returns typed timed segments by default or one joined text block. max_chars bounds the returned rendering; truncated reports shortening. A 404 means no captions or an unavailable/live video, not a retry signal. One server call; no client retry.",
  promptSnippet:
    "youtube_transcript(video_id|url, language, format, max_chars): one public transcript",
  promptGuidelines: [
    "Use an exact video id or YouTube URL; do not guess a transcript URL.",
    "A no-captions or unavailable 404 is a stable outcome, not an automatic retry.",
    "The structured response keeps every returned segment; the text preview may shorten it.",
  ],
  outputSchema: resultEnvelope(transcriptResponseSchema),
  parameters: Type.Union([
    Type.Object(
      {
        video_id: videoIdField,
        language: languageField,
        format: formatField,
        max_chars: maxCharsField,
        timeout_ms: timeoutField,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        url: videoUrlField,
        language: languageField,
        format: formatField,
        max_chars: maxCharsField,
        timeout_ms: timeoutField,
      },
      { additionalProperties: false },
    ),
  ]),
};

