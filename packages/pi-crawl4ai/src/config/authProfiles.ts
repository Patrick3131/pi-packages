import { resolveEnvVars, resolveJsonValue, resolveNumber } from "./env";
import type { AuthCookie, AuthProfileConfig, Crawl4AIJsonConfig, ResolvedConfig, ResolvedAuthProfile } from "./types";

function normalizeList(values?: string[]): string[] | undefined {
  const normalized = values?.map((value) => value.trim().toLowerCase()).filter(Boolean);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function parseCookieHeader(cookieHeader: string): AuthCookie[] {
  return cookieHeader.split(";").map((part) => part.trim()).filter(Boolean)
    .map((part) => {
      const eqIndex = part.indexOf("=");
      return eqIndex === -1 ? null : { name: part.slice(0, eqIndex).trim(), value: part.slice(eqIndex + 1).trim() };
    })
    .filter((cookie): cookie is AuthCookie => Boolean(cookie?.name));
}

function parseCookies(value: AuthProfileConfig["cookies"]): AuthCookie[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((cookie) => resolveJsonValue(cookie));

  const resolved = resolveEnvVars(value).trim();
  if (!resolved) return undefined;

  try {
    const parsed = JSON.parse(resolved) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((cookie): cookie is AuthCookie => Boolean(cookie && typeof cookie === "object" && "name" in cookie && "value" in cookie))
        .map((cookie) => resolveJsonValue(cookie));
    }
  } catch {}

  const cookies = parseCookieHeader(resolved);
  return cookies.length > 0 ? cookies : undefined;
}

export function resolveAuthProfiles(
  authProfiles?: Crawl4AIJsonConfig["authProfiles"]
): ResolvedConfig["authProfiles"] {
  if (!authProfiles) return undefined;

  return Object.fromEntries(Object.entries(authProfiles).map(([name, profile]) => [name, {
    matchSites: normalizeList(profile.matchSites),
    matchDomains: normalizeList(profile.matchDomains),
    cookies: parseCookies(profile.cookies),
    headers: profile.headers ? resolveJsonValue(profile.headers) : undefined,
    userAgent: profile.userAgent ? resolveEnvVars(profile.userAgent) : undefined,
    backoffMs: resolveNumber(profile.backoffMs),
  } satisfies ResolvedAuthProfile]));
}
