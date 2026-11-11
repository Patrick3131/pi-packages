import type {
  YoutubeSearchResponse,
  YoutubeTranscriptResponse,
} from "../src/youtube-types.js";

export const searchResponse: YoutubeSearchResponse = {
  query: "python 3.13",
  estimated_results: 123456,
  results: [
    {
      video_id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Python 3.13 release",
      channel: "Python",
      channel_id: "UC1234567890",
      duration_s: 213,
      published_text: "2 weeks ago",
      view_count: 12345,
      live: false,
      has_captions: true,
      captions_advertised: true,
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    },
    {
      video_id: "mMHw1zEev-0",
      url: "https://www.youtube.com/watch?v=mMHw1zEev-0",
      title: "Live stream",
      channel: "Example",
      channel_id: null,
      duration_s: null,
      published_text: null,
      view_count: null,
      live: true,
      has_captions: false,
      captions_advertised: false,
      thumbnail_url: "https://i.ytimg.com/vi/mMHw1zEev-0/hqdefault.jpg",
    },
  ],
};

export const segmentResponse: YoutubeTranscriptResponse = {
  video_id: "dQw4w9WgXcQ",
  title: "Python 3.13 release",
  channel: "Python",
  channel_id: "UC1234567890",
  duration_s: 213,
  language: "en",
  language_kind: "manual",
  available_languages: ["de-DE", "en"],
  segments: [
    { start_ms: 0, duration_ms: 1500, text: "Hello and welcome." },
    { start_ms: 1500, duration_ms: 2100, text: "Today we ship Python." },
  ],
  text: null,
  truncated: false,
  cached: false,
  window_start_ms: null,
  next_start_ms: null,
  total_chars: 40,
  returned_chars: 40,
};

export const textResponse: YoutubeTranscriptResponse = {
  ...segmentResponse,
  segments: [],
  text: "Hello and welcome. Today we ship Python.",
  truncated: false,
  cached: true,
  window_start_ms: 0,
  next_start_ms: null,
  total_chars: 40,
  returned_chars: 40,
};

export interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
}

/** Deterministic fetch stub that records the exact route and body Pi sent. */
export function recordingFetch(
  payload: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
    text?: string;
  } = {},
): { calls: RecordedCall[]; fetch: typeof fetch } {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(options.text ?? JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: options.headers,
    });
  };
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}

export const channelResponse = {
  channel: {
    channel_id: "UCaobKrMmIx40ZE_MGxbqDPA",
    handle: "@TheConsumerBehaviorLab",
    title: "The Consumer Behavior Lab",
    subscriber_count: 2630,
    subscriber_count_text: "2.63K subscribers",
    video_count: 116,
    canonical_url: "https://www.youtube.com/@TheConsumerBehaviorLab",
    avatar_url: "https://yt3.googleusercontent.com/avatar=s88",
  },
  about: {
    description: "Consumer behavior research and practical marketing lessons.",
    view_count: 121072,
    view_count_text: "121,072 views",
    joined_text: "Joined Feb 27, 2024",
    links: [{ title: "Website", url: "https://example.com/" }],
  },
  videos: [
    {
      video_id: "9K9AL0Sji6U",
      url: "https://www.youtube.com/watch?v=9K9AL0Sji6U",
      title: "Why consumers behave differently",
      duration_s: 2662,
      published_text: "6 days ago",
      published_at: "2026-11-04T17:04:42Z",
      view_count: 162,
      live: false,
      thumbnail_url: "https://i.ytimg.com/vi/9K9AL0Sji6U/hqdefault.jpg",
    },
    {
      video_id: "p48f-kj1U28",
      url: "https://www.youtube.com/watch?v=p48f-kj1U28",
      title: "A long interview",
      duration_s: 4258,
      published_text: "13 days ago",
      view_count: 4200,
      live: true,
      thumbnail_url: "https://i.ytimg.com/vi/p48f-kj1U28/hqdefault.jpg",
    },
  ],
  next_cursor: "opaque-next-token",
  has_more: true,
  cursor_overflow: false,
  cached: false,
};

export const videoResponse = {
  video_id: "p48f-kj1U28",
  url: "https://www.youtube.com/watch?v=p48f-kj1U28",
  title: "A long interview",
  channel: "The Consumer Behavior Lab",
  channel_id: "UCaobKrMmIx40ZE_MGxbqDPA",
  description: "A long interview about consumer behavior.",
  description_truncated: false,
  published_at: "2026-10-28T16:51:31Z",
  duration_s: 4258,
  view_count: 405,
  like_count: 5,
  comment_count: 0,
  live: false,
  live_status: "none",
  tags: ["consumer", "marketing"],
  tags_truncated: false,
  category_id: "24",
  thumbnail_url: "https://i.ytimg.com/vi/p48f-kj1U28/hqdefault.jpg",
  cached: false,
  source: "youtube_data_api",
};

export const channelTextResponse = {
  ...channelResponse,
  about: null,
  videos: [],
  next_cursor: null,
  has_more: false,
  cursor_overflow: true,
  cached: true,
};
