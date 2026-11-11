import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isYoutubeEnabledByEnv } from "./config.js";
import { YoutubeClientError } from "./youtube-errors.js";
import {
  formatYoutubeChannel,
  formatYoutubeSearch,
  formatYoutubeTranscript,
  formatYoutubeVideo,
  TRANSCRIPT_SEGMENT_REQUEST_CHARS,
  TRANSCRIPT_TEXT_REQUEST_CHARS,
} from "./youtube-format.js";
import {
  YOUTUBE_NOT_FOUND_CODES,
  type YoutubeChannelParams,
  type YoutubeSearchParams,
  type YoutubeTranscriptParams,
  type YoutubeResultEnvelope,
  type YoutubeVideoParams,
} from "./youtube-types.js";
import {
  getYoutubeChannel,
  getYoutubeTranscript,
  getYoutubeVideo,
  searchYoutube,
} from "./youtube.js";
import {
  youtubeChannelDefinition,
  youtubeSearchDefinition,
  youtubeTranscriptDefinition,
  youtubeVideoDefinition,
} from "./youtube-definitions.js";

type Structured = NonNullable<
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>["structuredContent"]
>;
type ToolResult =
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>;

export {
  youtubeChannelDefinition,
  youtubeSearchDefinition,
  youtubeTranscriptDefinition,
  youtubeVideoDefinition,
} from "./youtube-definitions.js";

function failureText(
  error: YoutubeClientError,
  status: "not_found" | "error",
  kind: "transcript" | "channel" | "video",
): string {
  if (error.code === "metadata_unavailable")
    return "YouTube video metadata is unavailable on the server: the Data API key is missing, revoked, forbidden or its daily quota is exhausted. This is not a video-based retry signal; search, channel and transcript stay available.";
  if (status === "not_found" && kind === "video")
    return "No public video metadata was found for this id. It may be private, deleted or region-blocked; this is not a retry signal.";
  if (status === "not_found" && kind === "channel")
    return "No public channel was found for this selector. This is not a retry signal; check the channel id, handle or URL.";
  if (status === "not_found")
    return `No public transcript is available for this video (${error.serverCode}). This is not a retry signal and is not proof that the video is private.`;
  if (error.code === "disabled")
    return "YouTube acquisition is disabled by the server gate.";
  if (error.code === "queue_full")
    return "YouTube acquisition capacity is full; this client does not retry.";
  if (error.code === "blocked")
    return `YouTube acquisition was blocked by the provider or proxy (${error.serverCode ?? "blocked"}). This client does not retry.`;
  if (error.code === "timeout")
    return "YouTube acquisition exceeded the server deadline.";
  if (error.code === "malformed")
    return "The YouTube endpoint returned a malformed success response.";
  if (error.code === "transport")
    return "The YouTube endpoint could not be reached.";
  return `YouTube request failed (${error.code}).`;
}

function failureResult(
  error: YoutubeClientError,
  kind: "transcript" | "channel" | "video" = "transcript",
): ToolResult {
  const status = YOUTUBE_NOT_FOUND_CODES.has(error.serverCode ?? "")
    ? "not_found"
    : "error";
  const suffix = [
    error.serverCode ? `Server code: ${error.serverCode}.` : "",
    error.reason ? `Reason: ${error.reason}.` : "",
    error.retryAfterMs
      ? `Advisory retry after ${Math.ceil(error.retryAfterMs / 1000)} s; this client does not retry or wait.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = failureText(error, status, kind);
  const details: YoutubeResultEnvelope<never> = {
    status,
    error: {
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.serverCode === undefined
        ? {}
        : { serverCode: error.serverCode }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
      ...(error.reason === undefined ? {} : { reason: error.reason }),
    },
  };
  return {
    isError: status === "error",
    content: [
      { type: "text" as const, text: [text, suffix].filter(Boolean).join(" ") },
    ],
    details,
    structuredContent: details as unknown as Structured,
  };
}

function successResult(formatted: {
  text: string;
  details: object;
}): ToolResult {
  return {
    isError: false,
    content: [{ type: "text" as const, text: formatted.text }],
    details: formatted.details,
    structuredContent: formatted.details as unknown as Structured,
  };
}

/** One single-page search. */
export async function executeYoutubeSearch(
  params: YoutubeSearchParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatYoutubeSearch(await searchYoutube(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof YoutubeClientError)) throw error;
    return failureResult(error);
  }
}

/** One exact transcript query. */
export async function executeYoutubeTranscript(
  params: YoutubeTranscriptParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    const format = params.format ?? "segments";
    const budget =
      format === "text"
        ? TRANSCRIPT_TEXT_REQUEST_CHARS
        : TRANSCRIPT_SEGMENT_REQUEST_CHARS;
    const max_chars = Math.max(
      1000,
      Math.min(params.max_chars ?? budget, budget),
    );
    return successResult(
      formatYoutubeTranscript(
        await getYoutubeTranscript({ ...params, max_chars }, { signal }),
      ),
    );
  } catch (error) {
    if (!(error instanceof YoutubeClientError)) throw error;
    return failureResult(error);
  }
}

/** One channel page; transcripts are intentionally never fetched here. */
export async function executeYoutubeChannel(
  params: YoutubeChannelParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatYoutubeChannel(await getYoutubeChannel(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof YoutubeClientError)) throw error;
    return failureResult(error, "channel");
  }
}

/** One keyed Data API metadata read; never comments and never a transcript. */
export async function executeYoutubeVideo(
  params: YoutubeVideoParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatYoutubeVideo(await getYoutubeVideo(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof YoutubeClientError)) throw error;
    return failureResult(error, "video");
  }
}

export function registerYoutube(pi: ExtensionAPI): void {
  const defaultActive = isYoutubeEnabledByEnv();
  pi.registerTool({
    ...youtubeSearchDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeYoutubeSearch(params as unknown as YoutubeSearchParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...youtubeTranscriptDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeYoutubeTranscript(
        params as unknown as YoutubeTranscriptParams,
        signal,
      ),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...youtubeVideoDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeYoutubeVideo(params as unknown as YoutubeVideoParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...youtubeChannelDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeYoutubeChannel(params as unknown as YoutubeChannelParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
}
