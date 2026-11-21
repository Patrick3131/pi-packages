import { environment, resolveAdLibraryConfig } from "../../config.js";

export interface AdLibraryCandidate {
  page_id: string;
  page_name?: string | null;
  votes: number;
  ads: number;
  landing_domains?: string[];
}
export interface AdLibraryOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}
// Shape check, not an enumeration: a new server reason must not require a
// tool republish to reach the model.
const isReason = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value);
const codes = new Set([
  "invalid_request",
  ...[
    "disabled",
    "page_not_found",
    "page_ambiguous",
    "queue_full",
    "rate_limited",
    "blocked",
    "upstream",
    "timeout",
  ].map((c) => "ad_library_" + c),
]);
export class AdLibraryClientError extends Error {
  constructor(
    public code: string,
    public status?: number,
    public serverCode?: string,
    public requestId?: string,
    public retryAfterMs?: number,
    public candidates?: AdLibraryCandidate[],
    public retryWith?: { page_id: string },
    public reason?: string,
  ) {
    super(`Ad library request failed (${code}).`);
    this.name = "AdLibraryClientError";
  }
}
export const record = (x: unknown): x is Record<string, any> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export async function postAdLibrary(
  path: "/v1/ad-library/search" | "/v1/ad-library/linkedin/search",
  body: { timeout_ms?: number },
  options: AdLibraryOptions,
): Promise<unknown> {
  const abort = () => new DOMException("Ad library cancelled.", "AbortError");
  if (options.signal?.aborted) throw abort();
  let config: { baseUrl: string; timeoutMs: number };
  try {
    config = resolveAdLibraryConfig(environment(options.env));
  } catch {
    throw new AdLibraryClientError("invalid_request");
  }
  const timeout = Math.max(
    config.timeoutMs,
    (body.timeout_ms ?? 120000) + 10000,
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
    const response = await (options.fetch ?? fetch)(config.baseUrl + path, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (response.ok) throw new AdLibraryClientError("malformed");
    }
    if (controller.signal.aborted) throw new AdLibraryClientError("timeout");
    if (!response.ok) {
      const e = record(data) && record(data.error) ? data.error : {};
      const known = codes.has(e.code) ? e.code : undefined;
      const rid =
        typeof e.request_id === "string" &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(e.request_id)
          ? e.request_id
          : undefined;
      const retry = response.headers.get("Retry-After");
      throw new AdLibraryClientError(
        known ?? "upstream",
        response.status,
        known,
        rid,
        retry && /^\d+$/.test(retry)
          ? Math.min(Number(retry) * 1000, 86400000)
          : undefined,
        Array.isArray(e.candidates)
          ? (e.candidates.filter(record) as AdLibraryCandidate[]).slice(0, 5)
          : undefined,
        record(e.retry_with) && typeof e.retry_with.page_id === "string"
          ? { page_id: e.retry_with.page_id }
          : undefined,
        isReason(e.reason) ? e.reason : undefined,
      );
    }
    return data;
  } catch (e) {
    if (options.signal?.aborted) throw abort();
    if (timedOut) throw new AdLibraryClientError("timeout");
    if (e instanceof AdLibraryClientError) throw e;
    throw new AdLibraryClientError("transport");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
