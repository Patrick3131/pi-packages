import { environment, resolveAmazonConfig } from "./config.js";
import { AmazonClientError } from "./amazon-errors.js";
import {
  AMAZON_HTTP_TIMEOUT_MARGIN_MS,
  AMAZON_SERVER_CODES,
  type AmazonClientCode,
  type AmazonClientOptions,
  type AmazonListingResponse,
  type AmazonNewReleasesParams,
  type AmazonProductParams,
  type AmazonProductResponse,
  type AmazonSearchParams,
} from "./amazon-types.js";
import {
  amazonNewReleasesRequest,
  amazonProductRequest,
  amazonSearchRequest,
  optionalAmazonUsage,
  parseAmazonListingResponse,
  parseAmazonProductResponse,
  type AmazonRequest,
} from "./amazon-validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isReason = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value);

const CLIENT_CODE: Record<string, AmazonClientCode> = {
  amazon_invalid_request: "invalid_request",
  amazon_disabled: "disabled",
  amazon_not_found: "not_found",
  amazon_queue_full: "queue_full",
  amazon_blocked: "blocked",
  amazon_upstream: "upstream",
  amazon_timeout: "timeout",
};

function serverFailure(response: Response, data: unknown): AmazonClientError {
  const body = isRecord(data) && isRecord(data.error) ? data.error : {};
  const usage = isRecord(data) ? optionalAmazonUsage(data.usage) : undefined;
  const serverCode =
    typeof body.code === "string" && AMAZON_SERVER_CODES.has(body.code)
      ? body.code
      : undefined;
  const requestId =
    typeof body.request_id === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(body.request_id)
      ? body.request_id
      : undefined;
  const retryAfter = response.headers.get("Retry-After");
  return new AmazonClientError(
    serverCode ? (CLIENT_CODE[serverCode] ?? "upstream") : "upstream",
    response.status,
    serverCode,
    requestId,
    response.status === 429 && retryAfter && /^\d+$/.test(retryAfter)
      ? Math.min(Number(retryAfter) * 1000, 86400000)
      : undefined,
    isReason(body.reason) ? body.reason : undefined,
    usage,
  );
}

/**
 * One HTTP exchange per call: no client retries, no admission prediction and no
 * health probe. Caller abort wins and stays AbortError; the owned timer covers
 * the whole exchange and is cleared on every exit.
 */
async function requestAmazon(
  request: AmazonRequest,
  options: AmazonClientOptions,
): Promise<unknown> {
  const abort = () =>
    new DOMException("Amazon request cancelled.", "AbortError");
  if (options.signal?.aborted) throw abort();
  let config: { baseUrl: string; timeoutMs: number };
  try {
    config = resolveAmazonConfig(environment(options.env));
  } catch {
    throw new AmazonClientError("invalid_request");
  }
  const timeout = Math.max(
    config.timeoutMs,
    request.serverTimeoutMs + AMAZON_HTTP_TIMEOUT_MARGIN_MS,
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
      if (response.ok) throw new AmazonClientError("malformed");
    }
    if (controller.signal.aborted) throw new AmazonClientError("timeout");
    if (!response.ok) throw serverFailure(response, data);
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw abort();
    if (timedOut) throw new AmazonClientError("timeout");
    if (error instanceof AmazonClientError) throw error;
    throw new AmazonClientError("transport");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

/** One New Releases page; the caller owns the sweep diff across pages and calls. */
export async function newAmazonReleases(
  params: AmazonNewReleasesParams,
  options: AmazonClientOptions = {},
): Promise<AmazonListingResponse> {
  const request = amazonNewReleasesRequest(params);
  return parseAmazonListingResponse(
    await requestAmazon(request, options),
    request,
  );
}

/** One search page; the caller chooses newest or relevance; no continuation and no client retry. */
export async function searchAmazon(
  params: AmazonSearchParams,
  options: AmazonClientOptions = {},
): Promise<AmazonListingResponse> {
  const request = amazonSearchRequest(params);
  return parseAmazonListingResponse(
    await requestAmazon(request, options),
    request,
  );
}

/** One product detail page lookup for a canonical ASIN. */
export async function getAmazonProduct(
  params: AmazonProductParams,
  options: AmazonClientOptions = {},
): Promise<AmazonProductResponse> {
  const request = amazonProductRequest(params);
  return parseAmazonProductResponse(
    await requestAmazon(request, options),
    request.asin,
  );
}

export { AmazonClientError } from "./amazon-errors.js";
export { formatAmazonListing, formatAmazonProduct } from "./amazon-format.js";
