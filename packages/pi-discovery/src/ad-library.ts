import { environment, resolveAdLibraryConfig } from "./config.js";

export interface AdLibraryParams {
  keyword?: string;
  domain?: string;
  page_id?: string;
  country?: string;
  active_only?: boolean;
  max_ads?: number;
  timeout_ms?: number;
  cursor?: string;
}
export interface AdImage {
  original_image_url?: string | null;
  resized_image_url?: string | null;
  watermarked_resized_image_url?: string | null;
}
export interface AdVideo {
  video_hd_url?: string | null;
  video_sd_url?: string | null;
  video_preview_image_url?: string | null;
  watermarked_video_hd_url?: string | null;
  watermarked_video_sd_url?: string | null;
}
export interface AdCard extends AdImage, AdVideo {
  headline?: string | null;
  body?: string | null;
  description?: string | null;
  caption?: string | null;
  cta?: string | null;
  cta_type?: string | null;
  landing_url?: string | null;
  landing_domain?: string | null;
}
export interface AdLibraryAd {
  archive_id: string;
  page_id: string | null;
  page_name: string | null;
  landing_url?: string | null;
  landing_domain?: string | null;
  images?: AdImage[];
  videos?: AdVideo[];
  cards?: AdCard[];
  creative_truncated?: boolean;
  template_fields?: Array<"headline" | "body" | "description">;
  representative_card_index?: number | null;
  [key: string]: unknown;
}
export interface AdLibraryCandidate {
  page_id: string;
  page_name?: string | null;
  votes: number;
  ads: number;
  landing_domains?: string[];
}
export interface AdLibraryAdvertiser {
  page_id: string;
  page_name?: string | null;
  ads: number;
  active: number;
  landing_domains?: string[];
}

export interface AdLibraryResult {
  id: string;
  provider: "meta_ad_library";
  mode: "keyword" | "page";
  query: string;
  country: string;
  active_only: boolean;
  ads: AdLibraryAd[];
  pages: Array<Record<string, unknown>>;
  resolved_page: {
    page_id: string;
    page_name: string | null;
    votes: number;
    total: number;
    pages_inspected: number;
    sample_truncated: boolean;
    evidence?: "landing_url" | "card_url" | null;
  } | null;
  advertisers?: AdLibraryAdvertiser[];
  cap_reason?: "ad_limit" | "page_budget" | null;
  next_cursor?: string | null;
  complete?: boolean;
  dropped?: number;
  failed_pages: Array<{ page: number; error_code: string }>;
  truncation: Array<"ad_cap" | "page_cap" | "page_failure">;
  partial: boolean;
  truncated: boolean;
  timings: { queue_ms: number; upstream_ms: number; total_ms: number };
}
export interface AdLibraryOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}
const reasons = new Set([
  "doc_id_retired",
  "login_required",
  "schema",
  "shape",
  "transport",
  "http_status",
  "proxy_missing",
  "no_domain_evidence",
  "cursor_mismatch",
]);
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
const record = (x: unknown): x is Record<string, any> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export function adLibraryRequest(
  params: AdLibraryParams,
): Required<
  Pick<AdLibraryParams, "timeout_ms" | "max_ads" | "country" | "active_only">
> &
  AdLibraryParams {
  const p = { ...params };
  if (
    Object.keys(p).some(
      (k) =>
        ![
          "keyword",
          "domain",
          "page_id",
          "country",
          "active_only",
          "max_ads",
          "timeout_ms",
          "cursor",
        ].includes(k),
    )
  )
    throw new AdLibraryClientError("invalid_request");
  for (const key of ["keyword", "domain", "page_id"] as const) {
    if (p[key] !== undefined) {
      if (typeof p[key] !== "string")
        throw new AdLibraryClientError("invalid_request");
      p[key] = p[key]!.trim();
    }
  }
  if (
    [p.keyword, p.domain, p.page_id].filter((x) => x !== undefined).length !==
      1 ||
    (p.keyword !== undefined && (!p.keyword || p.keyword.length > 200)) ||
    (p.page_id !== undefined && !/^[0-9]{1,32}$/.test(p.page_id))
  )
    throw new AdLibraryClientError("invalid_request");
  if (p.domain !== undefined) {
    p.domain = p.domain.toLowerCase().replace(/^www\./, "");
    if (
      p.domain.length < 3 ||
      p.domain.length > 253 ||
      !p.domain.includes(".") ||
      p.domain
        .split(".")
        .some((x) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))
    )
      throw new AdLibraryClientError("invalid_request");
  }
  if (
    p.cursor !== undefined &&
    (typeof p.cursor !== "string" ||
      !/^[\x21-\x7e]{1,65536}$/.test(p.cursor) ||
      p.domain !== undefined)
  )
    throw new AdLibraryClientError("invalid_request");
  if (p.country !== undefined && typeof p.country !== "string")
    throw new AdLibraryClientError("invalid_request");
  const body = {
    ...p,
    country: (p.country ?? "US").trim().toUpperCase(),
    active_only: p.active_only ?? true,
    max_ads: p.max_ads ?? 30,
    timeout_ms: p.timeout_ms ?? 120000,
  };
  if (
    !/^[A-Z]{2}$/.test(body.country) ||
    typeof body.active_only !== "boolean" ||
    !Number.isSafeInteger(body.max_ads) ||
    body.max_ads < 10 ||
    body.max_ads > 300 ||
    !Number.isSafeInteger(body.timeout_ms) ||
    body.timeout_ms < 5000 ||
    body.timeout_ms > 180000
  )
    throw new AdLibraryClientError("invalid_request");
  return body;
}
function parseResult(data: unknown, cap: number): AdLibraryResult {
  const fail = () => {
    throw new AdLibraryClientError("malformed");
  };
  if (
    !record(data) ||
    data.provider !== "meta_ad_library" ||
    !["keyword", "page"].includes(data.mode) ||
    typeof data.id !== "string" ||
    typeof data.query !== "string" ||
    typeof data.country !== "string" ||
    typeof data.active_only !== "boolean" ||
    !Array.isArray(data.ads) ||
    data.ads.length > cap ||
    !data.ads.every(
      (a: unknown) =>
        record(a) &&
        typeof a.archive_id === "string" &&
        (a.page_id === null || typeof a.page_id === "string") &&
        (a.page_name === null || typeof a.page_name === "string"),
    ) ||
    new Set(data.ads.map((a: AdLibraryAd) => a.archive_id)).size !==
      data.ads.length ||
    !Array.isArray(data.pages) ||
    !data.pages.every(record) ||
    !Array.isArray(data.failed_pages) ||
    !Array.isArray(data.truncation) ||
    data.truncation.some(
      (x: unknown) =>
        !["ad_cap", "page_cap", "page_failure"].includes(String(x)),
    ) ||
    typeof data.partial !== "boolean" ||
    typeof data.truncated !== "boolean" ||
    data.truncated !== data.truncation.length > 0 ||
    data.partial !== data.truncation.includes("page_failure") ||
    !record(data.timings) ||
    !["queue_ms", "upstream_ms", "total_ms"].every(
      (k) => Number.isFinite(data.timings[k]) && data.timings[k] >= 0,
    ) ||
    !(data.resolved_page === null || record(data.resolved_page)) ||
    (data.cap_reason != null &&
      !["ad_limit", "page_budget"].includes(String(data.cap_reason))) ||
    (data.advertisers !== undefined &&
      !(Array.isArray(data.advertisers) && data.advertisers.every(record))) ||
    (data.next_cursor !== undefined &&
      data.next_cursor !== null &&
      typeof data.next_cursor !== "string") ||
    (data.complete !== undefined && typeof data.complete !== "boolean") ||
    (data.dropped !== undefined &&
      !(Number.isSafeInteger(data.dropped) && data.dropped >= 0))
  )
    return fail();
  return data as AdLibraryResult;
}
export async function searchAdLibrary(
  params: AdLibraryParams,
  options: AdLibraryOptions = {},
): Promise<AdLibraryResult> {
  const abort = () => new DOMException("Ad library cancelled.", "AbortError");
  if (options.signal?.aborted) throw abort();
  const body = adLibraryRequest(params);
  let config: { baseUrl: string; timeoutMs: number };
  try {
    config = resolveAdLibraryConfig(environment(options.env));
  } catch {
    throw new AdLibraryClientError("invalid_request");
  }
  const timeout = Math.max(config.timeoutMs, body.timeout_ms + 10000);
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
      config.baseUrl + "/v1/ad-library/search",
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
        reasons.has(e.reason) ? e.reason : undefined,
      );
    }
    return parseResult(data, body.max_ads);
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
export function adsForAdvertiser(
  params: Omit<AdLibraryParams, "keyword">,
  options?: AdLibraryOptions,
): Promise<AdLibraryResult> {
  if (
    !(params.domain !== undefined || params.page_id !== undefined) ||
    "keyword" in params
  )
    throw new AdLibraryClientError("invalid_request");
  return searchAdLibrary(params, options);
}
export { formatAdLibrary } from "./ad-library-format.js";
