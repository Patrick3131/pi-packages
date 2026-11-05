import { WebAnswerClientError } from "./answer-errors.js";
import { DEFAULT_ENGINES, DEFAULT_SEARXNG_URL } from "./types.js";

export function isSearxngEnabledByEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.DISCOVERY_WEB_SEARCH_ENABLED?.trim();
  return value === "1" || value?.toLowerCase() === "true";
}

export function resolveSearxngBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.SEARXNG_URL?.trim() || DEFAULT_SEARXNG_URL;
  return raw.replace(/\/+$/, "");
}

export function resolveDefaultEngines(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.SEARXNG_ENGINES?.trim() || DEFAULT_ENGINES;
}

export function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SEARXNG_URL is not a valid URL (got: ${url})`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `SEARXNG_URL must use http:// or https:// (got: ${parsed.protocol})`,
    );
  }
}

export function environment(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env ?? process.env;
}

export function isWebAnswerEnabledByEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.DISCOVERY_WEB_ANSWER_ENABLED?.trim();
  return value === "1" || value?.toLowerCase() === "true";
}
export function liveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DISCOVERY_LIVE === "1";
}

export function resolveDiscoveryConfig(env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string;
  timeoutMs: number;
} {
  const raw = env.DISCOVERY_BASE_URL?.trim() || "http://10.8.0.1:18080";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebAnswerClientError("invalid_request");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new WebAnswerClientError("invalid_request");
  const timeoutMs =
    env.DISCOVERY_WEB_ANSWER_TIMEOUT_MS === undefined
      ? 310000
      : Number(env.DISCOVERY_WEB_ANSWER_TIMEOUT_MS);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  )
    throw new WebAnswerClientError("invalid_request");
  return { baseUrl: url.origin, timeoutMs };
}

export function isAdLibraryEnabledByEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return ["1", "true"].includes(
    env.DISCOVERY_AD_LIBRARY_ENABLED?.trim().toLowerCase() ?? "",
  );
}
export function resolveAdLibraryConfig(env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string;
  timeoutMs: number;
} {
  const baseUrl = resolveDiscoveryConfig({
    ...env,
    DISCOVERY_WEB_ANSWER_TIMEOUT_MS: "310000",
  }).baseUrl;
  const timeoutMs = Number(env.DISCOVERY_AD_LIBRARY_TIMEOUT_MS ?? 130000);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  )
    throw new Error("Invalid ad library timeout.");
  return { baseUrl, timeoutMs };
}

/** HTTP timeout floor for the social routes; raised automatically for long samples. */
export const SOCIAL_DEFAULT_HTTP_TIMEOUT_MS = 130000;

export function isSocialEnabledByEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return ["1", "true"].includes(
    env.DISCOVERY_SOCIAL_ENABLED?.trim().toLowerCase() ?? "",
  );
}

export function resolveSocialConfig(env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string;
  timeoutMs: number;
} {
  const baseUrl = resolveDiscoveryConfig({
    ...env,
    DISCOVERY_WEB_ANSWER_TIMEOUT_MS: "310000",
  }).baseUrl;
  const timeoutMs = Number(
    env.DISCOVERY_SOCIAL_TIMEOUT_MS ?? SOCIAL_DEFAULT_HTTP_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  )
    throw new Error("Invalid social timeout.");
  return { baseUrl, timeoutMs };
}
