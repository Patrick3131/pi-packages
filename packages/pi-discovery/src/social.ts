import { environment, resolveSocialConfig } from "./config.js";
import { SocialClientError } from "./social-errors.js";
import {
  SOCIAL_HTTP_TIMEOUT_MARGIN_MS,
  SOCIAL_SERVER_CODES,
  type SocialClientOptions,
  type SocialPostParams,
  type SocialPostResponse,
  type SocialProfileParams,
  type SocialProfilePostsParams,
  type SocialProfilePostsResponse,
  type SocialProfileResponse,
} from "./social-types.js";
import {
  parseSocialPostResponse,
  parseSocialProfilePostsResponse,
  parseSocialProfileResponse,
  socialPostRequest,
  socialProfilePostsRequest,
  socialProfileRequest,
  type SocialRequest,
} from "./social-validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
// Shape check, not an allowlist: a new server reason must not require a republish.
const isReason = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value);

function serverFailure(response: Response, data: unknown): SocialClientError {
  const body = isRecord(data) && isRecord(data.error) ? data.error : {};
  const known =
    typeof body.code === "string" && SOCIAL_SERVER_CODES.has(body.code)
      ? body.code
      : undefined;
  const requestId =
    typeof body.request_id === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(body.request_id)
      ? body.request_id
      : undefined;
  const retryAfter = response.headers.get("Retry-After");
  return new SocialClientError(
    known ?? "upstream",
    response.status,
    known,
    requestId,
    retryAfter && /^\d+$/.test(retryAfter)
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
async function requestSocial(
  request: SocialRequest,
  options: SocialClientOptions,
): Promise<unknown> {
  const abort = () => new DOMException("Social request cancelled.", "AbortError");
  if (options.signal?.aborted) throw abort();
  let config: { baseUrl: string; timeoutMs: number };
  try {
    config = resolveSocialConfig(environment(options.env));
  } catch {
    throw new SocialClientError("invalid_request");
  }
  const timeout = Math.max(
    config.timeoutMs,
    request.serverTimeoutMs + SOCIAL_HTTP_TIMEOUT_MARGIN_MS,
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
      if (response.ok) throw new SocialClientError("malformed");
    }
    if (controller.signal.aborted) throw new SocialClientError("timeout");
    if (!response.ok) throw serverFailure(response, data);
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw abort();
    if (timedOut) throw new SocialClientError("timeout");
    if (error instanceof SocialClientError) throw error;
    throw new SocialClientError("transport");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

/** One profile query: no listing or post hydration. */
export async function getSocialProfile(
  params: SocialProfileParams,
  options: SocialClientOptions = {},
): Promise<SocialProfileResponse> {
  return parseSocialProfileResponse(
    await requestSocial(socialProfileRequest(params), options),
  );
}

/** Profile plus a bounded, sequentially hydrated candidate sample. */
export async function getSocialProfilePosts(
  params: SocialProfilePostsParams,
  options: SocialClientOptions = {},
): Promise<SocialProfilePostsResponse> {
  return parseSocialProfilePostsResponse(
    await requestSocial(socialProfilePostsRequest(params), options),
  );
}

/** One exact post query. */
export async function getSocialPost(
  params: SocialPostParams,
  options: SocialClientOptions = {},
): Promise<SocialPostResponse> {
  return parseSocialPostResponse(
    await requestSocial(socialPostRequest(params), options),
  );
}

export { SocialClientError } from "./social-errors.js";
export { formatSocialPost, formatSocialProfile, formatSocialProfilePosts } from "./social-format.js";
