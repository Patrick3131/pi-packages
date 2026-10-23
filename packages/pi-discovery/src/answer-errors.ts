export type WebAnswerErrorCode =
  | "invalid_request"
  | "disabled"
  | "auth"
  | "busy"
  | "quota"
  | "upstream"
  | "timeout"
  | "transport"
  | "malformed";
const messages: Record<WebAnswerErrorCode, string> = {
  invalid_request: "Invalid discovery request or configuration.",
  disabled: "Web answers are disabled on the discovery server.",
  auth: "The operator must reauthenticate the discovery server Codex CLI.",
  busy: "Shared discovery capacity is busy.",
  quota: "The discovery account is currently rate limited.",
  upstream: "The discovery server could not complete the answer.",
  timeout: "The web-answer deadline was exceeded.",
  transport: "Could not reach the discovery service.",
  malformed: "Invalid discovery response shape.",
};
export class WebAnswerClientError extends Error {
  readonly code: WebAnswerErrorCode;
  readonly status?: number;
  readonly serverCode?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  constructor(
    code: WebAnswerErrorCode,
    details: {
      status?: number;
      serverCode?: string;
      requestId?: string;
      retryAfterMs?: number;
    } = {},
  ) {
    super(messages[code]);
    this.name = "WebAnswerClientError";
    this.code = code;
    Object.assign(this, details);
  }
}
export function retryAfter(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (value === null || !value.trim()) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const ms = Number(value) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (!/^[A-Za-z]{3},/.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
