/**
 * Generic proxy adapter that reads a full proxy URL from environment.
 * Format: http://[username:password@]host:port
 */

import type { ProxyAdapter, ProxyConfig } from "../types";

export const GENERIC_PROXY_URL_ENV = "CRAWL4AI_PROXY_URL";

/**
 * Adapter for a generic proxy URL.
 * Supports any proxy with the format: http://[user:pass@]host:port
 */
export const genericAdapter: ProxyAdapter = {
  name: "generic",

  isConfigured(): boolean {
    const url = process.env[GENERIC_PROXY_URL_ENV];
    return typeof url === "string" && url.length > 0;
  },

  getConfig(): ProxyConfig {
    const url = process.env[GENERIC_PROXY_URL_ENV];

    if (!url) {
      throw new Error(`${GENERIC_PROXY_URL_ENV} is not set`);
    }

    try {
      const parsed = new URL(url);

      return {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        adapterName: this.name,
      };
    } catch (error) {
      throw new Error(
        `Invalid ${GENERIC_PROXY_URL_ENV}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
