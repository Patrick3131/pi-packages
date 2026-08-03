import type { AuthCookie, Crawl4AIConfig, ResolvedAuthSelection } from "./types";

function ensureAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function normalizeCookieForUrl(cookie: AuthCookie, targetUrl: string): AuthCookie {
  if (cookie.url || (cookie.domain && cookie.path)) {
    return cookie;
  }

  return {
    ...cookie,
    url: ensureAbsoluteUrl(targetUrl),
  };
}

/**
 * Build crawl4ai browser_config for auth context only.
 *
 * Egress/proxy is owned by the crawl4ai server (operator pinning proxy).
 * This client never sends proxy credentials or proxy_config in the request body.
 */
export function buildBrowserConfig(
  _config: Crawl4AIConfig,
  authSelection?: ResolvedAuthSelection,
  urls?: string[]
): Record<string, unknown> {
  if (!authSelection) return {};

  const browserConfig: Record<string, unknown> = {};
  const { profile } = authSelection;
  const headers: Record<string, string> = {};

  if (profile.headers && Object.keys(profile.headers).length > 0) {
    Object.assign(headers, profile.headers);
  }
  if (profile.userAgent) browserConfig.user_agent = profile.userAgent;
  if (profile.cookies?.length) {
    const cookieTargetUrl = urls?.[0];
    const normalizedCookies = cookieTargetUrl
      ? profile.cookies.map((cookie) => normalizeCookieForUrl(cookie, cookieTargetUrl))
      : profile.cookies;

    browserConfig.cookies = normalizedCookies;
    if (headers.Cookie === undefined && headers.cookie === undefined) {
      headers.Cookie = normalizedCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    }
  }
  if (Object.keys(headers).length > 0) browserConfig.headers = headers;
  return browserConfig;
}
