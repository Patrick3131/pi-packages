import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isYoutubeEnabledByEnv } from "./config.js";
import { YoutubeClientError } from "./youtube-errors.js";
import {
  formatYoutubeSearch,
  formatYoutubeTranscript,
} from "./youtube-format.js";
import {
  YOUTUBE_NOT_FOUND_CODES,
  type YoutubeSearchParams,
  type YoutubeTranscriptParams,
  type YoutubeResultEnvelope,
} from "./youtube-types.js";
import {
  getYoutubeTranscript,
  searchYoutube,
} from "./youtube.js";
import {
  youtubeSearchDefinition,
  youtubeTranscriptDefinition,
} from "./youtube-definitions.js";

type Structured = NonNullable<
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>["structuredContent"]
>;
type ToolResult = import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>;

export {
  youtubeSearchDefinition,
  youtubeTranscriptDefinition,
} from "./youtube-definitions.js";

function failureResult(error: YoutubeClientError): ToolResult {
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
  const text =
    status === "not_found"
      ? `No public transcript is available for this video (${error.serverCode}). This is not a retry signal and is not proof that the video is private.`
      : error.code === "disabled"
        ? "YouTube acquisition is disabled by the server gate."
        : error.code === "queue_full"
          ? "YouTube acquisition capacity is full; this client does not retry."
          : error.code === "blocked"
            ? `YouTube acquisition was blocked by the provider or proxy (${error.serverCode ?? "blocked"}). This client does not retry.`
            : error.code === "timeout"
              ? "YouTube acquisition exceeded the server deadline."
              : error.code === "malformed"
                ? "The YouTube endpoint returned a malformed success response."
                : error.code === "transport"
                  ? "The YouTube endpoint could not be reached."
                  : `YouTube request failed (${error.code}).`;
  const details: YoutubeResultEnvelope<never> = {
    status,
    error: {
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.serverCode === undefined ? {} : { serverCode: error.serverCode }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
      ...(error.reason === undefined ? {} : { reason: error.reason }),
    },
  };
  return {
    isError: status === "error",
    content: [{ type: "text" as const, text: [text, suffix].filter(Boolean).join(" ") }],
    details,
    structuredContent: details as unknown as Structured,
  };
}

function successResult(formatted: { text: string; details: object }): ToolResult {
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
    return successResult(formatYoutubeSearch(await searchYoutube(params, { signal })));
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
    return successResult(
      formatYoutubeTranscript(await getYoutubeTranscript(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof YoutubeClientError)) throw error;
    return failureResult(error);
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
      executeYoutubeTranscript(params as unknown as YoutubeTranscriptParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
}
