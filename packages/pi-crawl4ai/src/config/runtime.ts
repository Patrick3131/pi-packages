import { loadConfig as loadResolvedConfig } from "./loader";
import type { Crawl4AIConfig } from "./types";

export function loadRuntimeConfig(options?: {
  cwd?: string;
  log?: (level: "info" | "warn" | "error", message: string) => void;
}): Crawl4AIConfig {
  const log = options?.log || (() => {});
  const raw = loadResolvedConfig(options?.cwd);

  if (raw.apiToken) {
    log("info", "crawl4ai API bearer token configured");
  }

  return {
    baseUrl: raw.baseUrl,
    timeout: raw.timeout,
    apiToken: raw.apiToken,
    raw,
  };
}
