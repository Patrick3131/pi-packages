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
};

export const textResponse: YoutubeTranscriptResponse = {
  ...segmentResponse,
  segments: [],
  text: "Hello and welcome. Today we ship Python.",
  truncated: true,
  cached: true,
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
