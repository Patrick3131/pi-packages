import { environment, resolveDiscoveryConfig } from "./config.js";
import {
  WebAnswerClientError,
  retryAfter,
  type WebAnswerErrorCode,
} from "./answer-errors.js";
import { requestBody, parseAnswer, record } from "./answer-validation.js";
import type {
  WebAnswerParams,
  WebAnswerOptions,
  WebAnswerResult,
  WebAnswerDetails,
} from "./answer-types.js";
export { WebAnswerClientError } from "./answer-errors.js";
export type { WebAnswerErrorCode } from "./answer-errors.js";
export type {
  WebAnswerParams,
  WebAnswerOptions,
  WebAnswerResult,
  WebAnswerDetails,
} from "./answer-types.js";

const mapping: Record<number, Record<string, WebAnswerErrorCode>> = {
  400: { invalid_request: "invalid_request" },
  401: { web_answer_disabled: "disabled", codex_auth_expired: "auth" },
  429: { web_answer_queue_full: "busy", codex_rate_limited: "quota" },
  502: { codex_transport: "upstream" },
  504: { codex_timeout: "timeout" },
};
function abortError(): DOMException {
  return new DOMException("Web answer cancelled.", "AbortError");
}

export async function askWeb(
  params: WebAnswerParams,
  options: WebAnswerOptions = {},
): Promise<WebAnswerResult> {
  if (options.signal?.aborted) throw abortError();
  const body = requestBody(params),
    config = resolveDiscoveryConfig(environment(options.env));
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < body.timeout_ms + 5000 ||
    timeoutMs > 2147483647
  )
    throw new WebAnswerClientError("invalid_request");
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(abortError());
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new WebAnswerClientError("timeout"));
  }, timeoutMs);
  try {
    const response = await (options.fetch ?? fetch)(
      config.baseUrl + "/v1/web-answer",
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (response.ok) throw new WebAnswerClientError("malformed");
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!response.ok) {
      const error = record(data) && record(data.error) ? data.error : undefined;
      const rawCode = typeof error?.code === "string" ? error.code : undefined;
      const known =
        rawCode && Object.values(mapping).some((c) => rawCode in c)
          ? rawCode
          : undefined;
      const requestId =
        typeof error?.request_id === "string" &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(error.request_id)
          ? error.request_id
          : undefined;
      throw new WebAnswerClientError(
        rawCode
          ? (mapping[response.status]?.[rawCode] ?? "upstream")
          : "upstream",
        {
          status: response.status,
          serverCode: known,
          requestId,
          retryAfterMs: retryAfter(response.headers.get("Retry-After")),
        },
      );
    }
    return parseAnswer(data, body.max_sources);
  } catch (error) {
    if (options.signal?.aborted) throw abortError();
    if (timedOut) throw new WebAnswerClientError("timeout");
    if (error instanceof WebAnswerClientError) throw error;
    throw new WebAnswerClientError("transport");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

export function webActivitySummary(
  result: Pick<WebAnswerResult, "searches" | "timings">,
): string {
  const count = result.searches.length;
  return `Web activity: ${count} recorded action${count === 1 ? "" : "s"} · ${(result.timings.total_ms / 1000).toFixed(1)} s server`;
}

export function formatWebAnswer(
  result: WebAnswerResult,
  latencyMs: number,
): { text: string; details: WebAnswerDetails } {
  const { answer, ...metadata } = result;
  const lines = [
    answer,
    "",
    webActivitySummary(result),
    "",
    "Retrieved results—may include uncited pages:",
    ...(result.sources.length
      ? result.sources.map(
          (s, i) =>
            `${i + 1}. ${s.title && s.title !== s.url ? s.title + " — " : ""}${s.url}`,
        )
      : ["No search results returned."]),
  ];
  if (result.gaps.length) lines.push("", "Gaps: " + result.gaps.join(", "));
  return {
    text: lines.join("\n"),
    details: { ...metadata, latencyMs, answerChars: answer.length },
  };
}
