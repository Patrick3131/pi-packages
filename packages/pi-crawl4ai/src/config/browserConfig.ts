import type { Crawl4AIConfig, ResolvedAuthSelection } from "./types";

export function buildBrowserConfig(
  config: Crawl4AIConfig,
  authSelection?: ResolvedAuthSelection
): Record<string, unknown> {
  const browserConfig = { ...config.proxyService.getBrowserConfig() } as Record<string, unknown>;
  if (!authSelection) return browserConfig;

  const { profile } = authSelection;
  const headers = { ...((browserConfig.headers as Record<string, string> | undefined) || {}) };
  if (profile.headers && Object.keys(profile.headers).length > 0) {
    Object.assign(headers, profile.headers);
  }
  if (profile.userAgent) browserConfig.user_agent = profile.userAgent;
  if (profile.cookies?.length) {
    browserConfig.cookies = profile.cookies;
    if (headers.Cookie === undefined && headers.cookie === undefined) {
      headers.Cookie = profile.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    }
  }
  if (Object.keys(headers).length > 0) browserConfig.headers = headers;
  return browserConfig;
}
