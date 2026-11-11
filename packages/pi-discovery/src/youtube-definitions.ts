import { Type, type TSchema } from "typebox";
import {
  YOUTUBE_DEFAULT_MAX_CHARS,
  YOUTUBE_MAX_MAX_CHARS,
  YOUTUBE_MAX_RESULTS,
  YOUTUBE_MAX_TIMEOUT_MS,
  YOUTUBE_MAX_URL_LENGTH,
  YOUTUBE_MIN_MAX_CHARS,
  YOUTUBE_SEGMENT_DEFAULT_MAX_CHARS,
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
    has_captions: Type.Optional(Type.Boolean()),
    captions_advertised: Type.Optional(Type.Boolean()),
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
    window_start_ms: Type.Optional(nullableCount),
    next_start_ms: Type.Optional(nullableCount),
    total_chars: Type.Optional(Type.Integer({ minimum: 0 })),
    returned_chars: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: true },
);

const videoMetadataSchema = Type.Object(
  {
    video_id: Type.String(),
    url: Type.String(),
    title: Type.String(),
    channel: Type.String(),
    channel_id: nullableText,
    description: Type.String({ maxLength: 5000 }),
    description_truncated: Type.Boolean(),
    published_at: Type.String(),
    duration_s: nullableCount,
    view_count: nullableCount,
    like_count: nullableCount,
    comment_count: nullableCount,
    live: Type.Boolean(),
    live_status: Type.Union([
      Type.Literal("none"),
      Type.Literal("live"),
      Type.Literal("upcoming"),
    ]),
    tags: Type.Array(Type.String(), { maxItems: 50 }),
    tags_truncated: Type.Boolean(),
    category_id: nullableText,
    thumbnail_url: Type.String(),
    cached: Type.Boolean(),
    source: Type.Literal("youtube_data_api"),
  },
  { additionalProperties: true },
);

const aboutLinkSchema = Type.Object(
  { title: Type.String(), url: Type.String() },
  { additionalProperties: true },
);
const aboutSchema = Type.Object(
  {
    description: Type.String(),
    view_count: nullableCount,
    view_count_text: nullableText,
    joined_text: nullableText,
    links: Type.Array(aboutLinkSchema, { maxItems: 8 }),
  },
  { additionalProperties: true },
);
const channelVideoSchema = Type.Object(
  {
    video_id: Type.String(),
    url: Type.String(),
    title: Type.String(),
    duration_s: nullableCount,
    published_text: nullableText,
    published_at: Type.Optional(nullableText),
    view_count: nullableCount,
    live: Type.Boolean(),
    thumbnail_url: Type.String(),
  },
  { additionalProperties: true },
);
const channelSchema = Type.Object(
  {
    channel_id: Type.String(),
    handle: nullableText,
    title: nullableText,
    subscriber_count: nullableCount,
    subscriber_count_text: nullableText,
    video_count: nullableCount,
    canonical_url: Type.String(),
    avatar_url: nullableText,
  },
  { additionalProperties: true },
);
const channelResponseSchema = Type.Object(
  {
    channel: channelSchema,
    about: Type.Union([aboutSchema, Type.Null()]),
    videos: Type.Array(channelVideoSchema, { maxItems: 30 }),
    next_cursor: nullableText,
    has_more: Type.Boolean(),
    cursor_overflow: Type.Boolean(),
    cached: Type.Boolean(),
  },
  { additionalProperties: true },
);

const timeoutField = Type.Optional(
  Type.Integer({
    minimum: YOUTUBE_MIN_TIMEOUT_MS,
    maximum: YOUTUBE_MAX_TIMEOUT_MS,
    description:
      "Server acquisition budget in milliseconds, including queue time. Default: 30000.",
  }),
);
const languageField = Type.Optional(
  Type.String({
    pattern: "^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$",
    description:
      "Language tag, for example en, de or pt-BR. Transcripts default to auto.",
  }),
);
const maxCharsField = Type.Optional(
  Type.Integer({
    minimum: YOUTUBE_MIN_MAX_CHARS,
    maximum: YOUTUBE_MAX_MAX_CHARS,
    default: YOUTUBE_DEFAULT_MAX_CHARS,
    description: `Maximum returned transcript characters (${YOUTUBE_MIN_MAX_CHARS}-${YOUTUBE_MAX_MAX_CHARS}), honoured exactly. Default ${YOUTUBE_DEFAULT_MAX_CHARS} for text (the whole transcript) and ${YOUTUBE_SEGMENT_DEFAULT_MAX_CHARS} for segments, which cost about 6x because of timings.`,
  }),
);
const startMsField = Type.Optional(
  Type.Integer({
    minimum: 0,
    maximum: 86400000,
    description:
      "Transcript window start in milliseconds; use next_start_ms from the previous response.",
  }),
);
const formatField = Type.Optional(
  Type.Union([Type.Literal("segments"), Type.Literal("text")], {
    default: "text",
    description:
      "One joined text block (default) or timed segments when timestamps matter.",
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
  promptSnippet:
    "youtube_search(query, max_results): one page of public videos",
  promptGuidelines: [
    "Use youtube_search for video discovery, then youtube_transcript for one selected video.",
    "The result is one bounded provider page; do not imply that it is the complete result set.",
    "has_captions is a badge, not proof that a transcript fetch will succeed.",
    "estimated_results is a provider estimate, not a relevance score; returned results are one page.",
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
    "Fetch the public transcript of one YouTube video. Supply exactly one video_id or YouTube URL. Without a language the service serves the video's original audio track, then English, then the first manual track. Returns one joined text block by default (the whole transcript in one response, up to 300000 chars) or typed timed segments when timestamps matter. The first line is FULL or PARTIAL with the served and total characters, so a partial read is never mistaken for the whole thing; start_ms resumes at a segment boundary. A 404 means no captions or an unavailable/live video, not a retry signal. One server call; no client retry.",
  promptSnippet:
    "youtube_transcript(video_id|url, language, format, max_chars): one public transcript",
  promptGuidelines: [
    "Use an exact video id or YouTube URL; do not guess a transcript URL.",
    "A no-captions or unavailable 404 is a stable outcome, not an automatic retry.",
    "The structured response keeps every returned segment; the text preview may shorten it.",
    "A PARTIAL first line means more text exists: pass its start_ms to continue, never guess an offset.",
    "Text is the default and costs ~6x less than segments; request segments only when timestamps are needed.",
  ],
  outputSchema: resultEnvelope(transcriptResponseSchema),
  parameters: Type.Union([
    Type.Object(
      {
        video_id: videoIdField,
        language: languageField,
        format: formatField,
        max_chars: maxCharsField,
        start_ms: startMsField,
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
        start_ms: startMsField,
        timeout_ms: timeoutField,
      },
      { additionalProperties: false },
    ),
  ]),
};

export const youtubeChannelDefinition = {
  name: "youtube_channel",
  label: "YouTube channel",
  description:
    "Read one public YouTube channel page: channel id, title, handle, subscriber/video counts, optional about text and up to 30 recent videos with ids, titles and durations. Pass channel_id, handle or a strict channel URL initially, then channel_id plus next_cursor for the next page. This tool never fetches transcripts: call youtube_transcript once for each chosen video_id. There is intentionally no max_videos; a provider page is 30 videos. One server call per page; no client retry.",
  promptSnippet:
    "youtube_channel(channel_id|handle|url): metadata and one 30-video page, no transcripts",
  promptGuidelines: [
    "Use youtube_channel when channel metadata or a channel's recent videos are needed; do not use a browser or scrape YouTube.",
    "A page has at most 30 videos. Continue only with the returned next_cursor and the same channel_id.",
    "Fetch transcripts individually with youtube_transcript; never batch or assume this tool fetched one.",
    "If about is null, videos are still valid. If cursor_overflow is true, more videos exist but paging is unavailable.",
  ],
  outputSchema: resultEnvelope(channelResponseSchema),
  parameters: Type.Object(
    {
      channel_id: Type.Optional(
        Type.String({
          pattern: "^UC[A-Za-z0-9_-]{22}$",
          description: "Channel id, required with cursor.",
        }),
      ),
      handle: Type.Optional(
        Type.String({
          pattern: "^@[A-Za-z0-9._-]{3,30}$",
          description: "Channel handle beginning with @.",
        }),
      ),
      url: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: YOUTUBE_MAX_URL_LENGTH,
          description:
            "Strict YouTube channel URL, optionally ending in /videos.",
        }),
      ),
      cursor: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: 8192,
          description: "Opaque next_cursor from the previous channel response.",
        }),
      ),
      language: languageField,
      region: Type.Optional(
        Type.String({
          pattern: "^[A-Za-z]{2}$",
          default: "US",
          description: "Two-letter region used for channel metadata.",
        }),
      ),
      timeout_ms: timeoutField,
    },
    { additionalProperties: false },
  ),
};

export const youtubeVideoDefinition = {
  name: "youtube_video",
  label: "YouTube video metadata",
  description:
    "Read one public YouTube video's metadata: exact ISO 8601 published_at, description, duration, view/like/comment counts, live status, tags and category. Supply exactly one video_id or YouTube URL. The text shows a bounded description preview; structured output keeps the full description. This tool never fetches comments or a transcript, and there is no batch mode. A 404 youtube_video_not_found is a stable outcome; 503 youtube_metadata_unavailable means the server has no Data API key or its quota/auth failed. One server call; no client retry.",
  promptSnippet:
    "youtube_video(video_id|url): one video's exact date, description and counts",
  promptGuidelines: [
    "Use youtube_video when exact publish dates, descriptions or counts matter; do not scrape watch pages or use yt-dlp.",
    "published_at is the provider's exact UTC timestamp; do not replace it with a relative label.",
    "Fetch comments or transcripts with a separate tool; this tool never returns them.",
    "Treat 503 youtube_metadata_unavailable as a server configuration/quota condition, not a retry signal from this client.",
  ],
  outputSchema: resultEnvelope(videoMetadataSchema),
  parameters: Type.Union([
    Type.Object(
      { video_id: videoIdField, timeout_ms: timeoutField },
      { additionalProperties: false },
    ),
    Type.Object(
      { url: videoUrlField, timeout_ms: timeoutField },
      { additionalProperties: false },
    ),
  ]),
};
