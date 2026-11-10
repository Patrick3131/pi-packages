import { environment, resolveYoutubeConfig } from "./config.js";
import { YoutubeClientError } from "./youtube-errors.js";
import {
  YOUTUBE_HTTP_TIMEOUT_MARGIN_MS,
  YOUTUBE_SERVER_CODES,
  type YoutubeClientOptions,
  type YoutubeChannelParams,
  type YoutubeChannelResponse,
  type YoutubeSearchParams,
  type YoutubeSearchResponse,
  type YoutubeTranscriptParams,
  type YoutubeTranscriptResponse,
} from "./youtube-types.js";
import {
  parseYoutubeChannelResponse,
  parseYoutubeSearchResponse,
  parseYoutubeTranscriptResponse,
  youtubeChannelRequest,
  youtubeSearchRequest,
  youtubeTranscriptRequest,
  type YoutubeRequest,
} from "./youtube-validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isReason = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value);

const CLIENT_CODE: Record<string, string> = {
  youtube_invalid_request: "invalid_request",
  youtube_disabled: "disabled",
  youtube_no_captions: "not_found",
  youtube_unavailable: "not_found",
  youtube_queue_full: "queue_full",
  youtube_blocked: "blocked",
  youtube_upstream: "upstream",
  youtube_timeout: "timeout",
  youtube_channel_not_found: "not_found",
};

function serverFailure(response: Response, data: unknown): YoutubeClientError {
  const body = isRecord(data) && isRecord(data.error) ? data.error : {};
  const serverCode =
    typeof body.code === "string" && YOUTUBE_SERVER_CODES.has(body.code)
      ? body.code
      : undefined;
  const requestId =
    typeof body.request_id === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(body.request_id)
      ? body.request_id
      : undefined;
  const retryAfter = response.headers.get("Retry-After");
  return new YoutubeClientError(
    serverCode ? (CLIENT_CODE[serverCode] ?? "upstream") : "upstream",
    response.status,
    serverCode,
    requestId,
    response.status === 429 && retryAfter && /^\d+$/.test(retryAfter)
      ? Math.min(Number(retryAfter) * 1000, 86400000)
      : undefined,
    isReason(body.reason) ? body.reason : undefined,
  );
}

/**
 * One HTTP exchange per call: no client retries, no admission prediction and no
 * health probe. Caller abort wins and stays AbortError; the owned timer covers
 * the whole exchange and is cleared on every exit.
 */
async function requestYoutube(
  request: YoutubeRequest,
  options: YoutubeClientOptions,
): Promise<unknown> {
  const abort = () =>
    new DOMException("YouTube request cancelled.", "AbortError");
  if (options.signal?.aborted) throw abort();
  let config: { baseUrl: string; timeoutMs: number };
  try {
    config = resolveYoutubeConfig(environment(options.env));
  } catch {
    throw new YoutubeClientError("invalid_request");
  }
  const timeout = Math.max(
    config.timeoutMs,
    request.serverTimeoutMs + YOUTUBE_HTTP_TIMEOUT_MARGIN_MS,
  );
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(abort());
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  try {
    const response = await (options.fetch ?? fetch)(
      config.baseUrl + request.endpoint,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      },
    );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (response.ok) throw new YoutubeClientError("malformed");
    }
    if (controller.signal.aborted) throw new YoutubeClientError("timeout");
    if (!response.ok) throw serverFailure(response, data);
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw abort();
    if (timedOut) throw new YoutubeClientError("timeout");
    if (error instanceof YoutubeClientError) throw error;
    throw new YoutubeClientError("transport");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

/** One single-page search: no continuation and no client retry. */
export async function searchYoutube(
  params: YoutubeSearchParams,
  options: YoutubeClientOptions = {},
): Promise<YoutubeSearchResponse> {
  const request = youtubeSearchRequest(params);
  return parseYoutubeSearchResponse(
    await requestYoutube(request, options),
    request.body.max_results as number,
  );
}

/** One transcript query, rendered by the server as segments or text. */
export async function getYoutubeTranscript(
  params: YoutubeTranscriptParams,
  options: YoutubeClientOptions = {},
): Promise<YoutubeTranscriptResponse> {
  const request = youtubeTranscriptRequest(params);
  return parseYoutubeTranscriptResponse(
    await requestYoutube(request, options),
    { resolvedVideoId: request.resolvedVideoId, format: request.format },
  );
}

/** One channel page; cursor continuation is a separate explicit call. */
export async function getYoutubeChannel(
  params: YoutubeChannelParams,
  options: YoutubeClientOptions = {},
): Promise<YoutubeChannelResponse> {
  const request = youtubeChannelRequest(params);
  return parseYoutubeChannelResponse(await requestYoutube(request, options));
}

export { YoutubeClientError } from "./youtube-errors.js";
