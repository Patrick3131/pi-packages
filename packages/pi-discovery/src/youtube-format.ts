import type {
  YoutubeChannelResponse,
  YoutubeResultEnvelope,
  YoutubeSearchResponse,
  YoutubeTranscriptResponse,
} from "./youtube-types.js";

/** Model-visible text stays bounded; structured output keeps every record. */
const TEXT_CAP = 12000;
const LABEL_RESERVE = 240;
const SEGMENT_PREVIEW = 30;
export const TRANSCRIPT_TEXT_REQUEST_CHARS = 8000;
export const TRANSCRIPT_SEGMENT_REQUEST_CHARS = 11500;

const clip = (value: string, cap: number) =>
  value.length > cap ? `${value.slice(0, cap)}… [text shortened]` : value;

const count = (value: number | null) =>
  value === null ? "unknown" : String(value);

function duration(seconds: number | null): string {
  if (seconds === null) return "unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function timestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function fit(text: string, labels: string[]): string {
  let result = text;
  for (const label of labels)
    if (label && result.length + label.length + 1 <= TEXT_CAP)
      result += "\n" + label;
  if (result.length > TEXT_CAP)
    result = `${result.slice(0, TEXT_CAP - LABEL_RESERVE - 1)}… [text shortened]`;
  return result;
}

export function formatYoutubeSearch(result: YoutubeSearchResponse): {
  text: string;
  summary: string;
  details: YoutubeResultEnvelope<YoutubeSearchResponse>;
} {
  const summary = `YouTube search "${result.query}" · ~${result.estimated_results} estimated · ${result.results.length} returned`;
  const lines = [summary];
  const previews = result.results.slice(0, 20);
  for (const [index, video] of previews.entries()) {
    const captions = video.captions_advertised ?? video.has_captions ?? false;
    lines.push(
      `${index + 1}. ${video.title}`,
      `   ${video.channel || "unknown channel"}${video.channel_id ? ` (${video.channel_id})` : ""} · ${duration(video.duration_s)} · ${count(video.view_count)} views${video.live ? " · LIVE" : ""}${captions ? " · caption badge advertised (not a transcript guarantee)" : " · no caption badge (not a transcript guarantee)"}`,
      `   ${video.url}`,
    );
  }
  const labels = [
    "One provider page only; there is no continuation. A caption badge is advisory, not a transcript guarantee.",
  ];
  if (result.results.length > previews.length)
    labels.push(
      `Text previews shortened: showing ${previews.length}/${result.results.length} results; structured output keeps every returned record.`,
    );
  return {
    text: fit(lines.join("\n"), labels),
    summary,
    details: { status: "ok", response: result },
  };
}

export function formatYoutubeTranscript(result: YoutubeTranscriptResponse): {
  text: string;
  summary: string;
  details: YoutubeResultEnvelope<YoutubeTranscriptResponse>;
} {
  const returned =
    result.returned_chars ??
    (result.text !== null
      ? result.text.length
      : result.segments.reduce(
          (total, segment, index) =>
            total + segment.text.length + (index > 0 ? 1 : 0),
          0,
        ));
  const total = result.total_chars ?? returned;
  const windowStart = result.window_start_ms ?? 0;
  const next = result.next_start_ms ?? null;
  const windowLabel = `${returned} chars from ${timestamp(windowStart)}; total ${total}; ${next === null ? "complete" : `continue at ${timestamp(next)} (start_ms=${next})`}`;
  const summary =
    `YouTube transcript ${result.video_id} · ${result.language} (${result.language_kind}) · ` +
    windowLabel +
    `${result.cached ? " · cached" : ""}`;
  const lines = [
    summary,
    `Title: ${result.title}`,
    `Channel: ${result.channel}${result.channel_id ? ` (${result.channel_id})` : ""} · duration ${duration(result.duration_s)}`,
    `Available languages: ${result.available_languages.join(", ") || "none returned"}`,
    `Video: https://www.youtube.com/watch?v=${result.video_id}`,
  ];
  if (result.cached)
    lines.push(
      "Served from this worker's transcript cache; no upstream request.",
    );
  if (next !== null)
    lines.push(
      `This formatter never cuts inside a segment. Request the next window with start_ms=${next}.`,
    );

  if (result.text !== null) {
    lines.push(`Text (${result.text.length} chars in this response):`);
    if (result.text.length <= TEXT_CAP) lines.push(result.text);
    else
      lines.push(
        clip(result.text, TEXT_CAP),
        `Only this response is shortened for display; the structured response keeps all ${result.text.length} returned chars.`,
      );
  } else if (result.segments.length === 0) {
    lines.push(
      "The requested window is empty; this is a valid complete position after the last segment.",
    );
  } else {
    const preview = result.segments.slice(0, SEGMENT_PREVIEW);
    lines.push("Segments:");
    for (const segment of preview)
      lines.push(
        `[${timestamp(segment.start_ms)}] ${clip(segment.text, 1000)}`,
      );
    if (preview.length < result.segments.length) {
      const omitted = result.segments[preview.length];
      lines.push(
        `Text previews shortened: showing ${preview.length}/${result.segments.length} segments; structured output keeps every returned segment.`,
        `Next preview segment starts at ${timestamp(omitted.start_ms)} (start_ms=${omitted.start_ms}).`,
      );
    } else if (next !== null) {
      lines.push(
        `Next segment starts at ${timestamp(next)} (start_ms=${next}).`,
      );
    }
  }
  return {
    text: fit(lines.join("\n"), [
      "Structured output keeps all returned segments, text, languages and timings; media is never downloaded.",
    ]),
    summary,
    details: { status: "ok", response: result },
  };
}

export function formatYoutubeChannel(result: YoutubeChannelResponse): {
  text: string;
  summary: string;
  details: YoutubeResultEnvelope<YoutubeChannelResponse>;
} {
  const channel = result.channel;
  const summary =
    `YouTube channel ${channel.title ?? channel.channel_id} · ` +
    `${channel.subscriber_count_text ?? "subscriber count unknown"} · ` +
    `${channel.video_count_text ?? "video count unknown"} · ${result.videos.length} videos returned` +
    `${result.cached ? " · cached" : ""}`;
  const lines = [
    summary,
    `Channel id: ${channel.channel_id}`,
    `Handle: ${channel.handle ?? "unknown"} · canonical: ${channel.canonical_url}`,
    `Subscriber count: ${channel.subscriber_count_text ?? "unknown"} (${channel.subscriber_count === null ? "no exact estimate" : "rounded provider value"})`,
    `About: ${result.about ? clip(result.about.description, 600) : "not available (videos still returned)"}`,
  ];
  if (result.about?.links.length)
    lines.push(
      `Links: ${result.about.links
        .slice(0, 3)
        .map((link) => link.title || "untitled")
        .join(
          " · ",
        )}${result.about.links.length > 3 ? ` · +${result.about.links.length - 3} more in structured details` : ""}`,
    );
  if (result.videos.length === 0) lines.push("Videos: none on this page.");
  else {
    lines.push("Videos:");
    for (const [index, video] of result.videos.entries())
      lines.push(
        `${index + 1}. ${clip(video.title, 120)} · ${video.video_id} · ${duration(video.duration_s)}${video.live ? " · LIVE" : ""}`,
      );
  }
  if (result.cursor_overflow)
    lines.push(
      "More videos exist but paging is unavailable because the provider cursor exceeded the safe bound. This page is not complete.",
    );
  else if (result.next_cursor !== null)
    lines.push(
      `Next page: call youtube_channel with channel_id=${channel.channel_id} and cursor=${result.next_cursor}`,
    );
  else lines.push("No further cursor was returned for this page.");
  lines.push(
    "Fetch transcripts individually with youtube_transcript; this tool never fetches them.",
    "Caller workflow: youtube_channel -> choose video_id values -> youtube_transcript once per chosen video; never batch automatically.",
  );
  const labels = [
    "Structured output keeps the full description, links and every returned video record.",
  ];
  return {
    text: fit(lines.join("\n"), labels),
    summary,
    details: { status: "ok", response: result },
  };
}
