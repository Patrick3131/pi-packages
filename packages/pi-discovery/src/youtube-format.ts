import type {
  YoutubeResultEnvelope,
  YoutubeSearchResponse,
  YoutubeTranscriptResponse,
} from "./youtube-types.js";

/** Model-visible text stays bounded; structured output keeps every record. */
const TEXT_CAP = 12000;
const LABEL_RESERVE = 240;
const SEGMENT_PREVIEW = 30;
const TRANSCRIPT_PREVIEW_CHARS = 8000;

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
    lines.push(
      `${index + 1}. ${video.title}`,
      `   ${video.channel || "unknown channel"}${video.channel_id ? ` (${video.channel_id})` : ""} · ${duration(video.duration_s)} · ${count(video.view_count)} views${video.live ? " · LIVE" : ""}${video.has_captions ? " · captions advertised" : " · no caption badge"}`,
      `   ${video.url}`,
    );
  }
  const labels = [
    "One provider page only; there is no continuation. has_captions is advisory, not a transcript guarantee.",
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
  const summary =
    `YouTube transcript ${result.video_id} · ${result.language} (${result.language_kind}) · ` +
    (result.text !== null
      ? `text · ${result.text.length} chars`
      : `segments · ${result.segments.length} segments`) +
    ` · ${result.truncated ? "truncated" : "complete"}${result.cached ? " · cached" : ""}`;
  const lines = [
    summary,
    `Title: ${result.title}`,
    `Channel: ${result.channel}${result.channel_id ? ` (${result.channel_id})` : ""} · duration ${duration(result.duration_s)}`,
    `Available languages: ${result.available_languages.join(", ") || "none returned"}`,
    `Video: https://www.youtube.com/watch?v=${result.video_id}`,
  ];
  if (result.cached)
    lines.push("Served from this worker's transcript cache; no upstream request.");
  if (result.truncated)
    lines.push(
      "The server truncated the returned rendering at max_chars; request a larger max_chars or use a smaller range.",
    );

  if (result.text !== null) {
    lines.push(
      `Text (${result.text.length} chars):`,
      clip(result.text, TRANSCRIPT_PREVIEW_CHARS),
    );
  } else {
    const preview = result.segments.slice(0, SEGMENT_PREVIEW);
    lines.push("Segments:");
    for (const segment of preview)
      lines.push(
        `[${timestamp(segment.start_ms)}] ${clip(segment.text, 1000)}`,
      );
    if (preview.length < result.segments.length)
      lines.push(
        `Text previews shortened: showing ${preview.length}/${result.segments.length} segments; structured output keeps every returned segment.`,
      );
  }
  return {
    text: fit(lines.join("\n"), [
      "Structured output keeps all returned segments, text, languages and timings; media is never downloaded.",
    ]),
    summary,
    details: { status: "ok", response: result },
  };
}
