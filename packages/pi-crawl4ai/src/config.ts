/**
 * Configuration for pi-crawl4ai extension.
 * Supports JSON config file and environment variables.
 */

import { loadConfig as loadConfigFromFile, type ResolvedConfig } from "./configLoader";
import { createProxyService, type ProxyService } from "./proxy";
import { createCustomAdapter, type CustomProxySettings } from "./proxy/adapters";
import type { ProxyAdapter, ProxyEndpoint } from "./proxy";

export interface Crawl4AIConfig {
  /** Base URL for crawl4ai Docker API */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Proxy service instance */
  proxyService: ProxyService;
  /** Whether proxy is enabled */
  proxyEnabled: boolean;
  /** Raw resolved config */
  raw: ResolvedConfig;
}

/**
 * Load configuration from JSON file and/or environment variables.
 */
export function loadConfig(
  options?: {
    cwd?: string;
    log?: (level: "info" | "warn" | "error", message: string) => void;
  }
): Crawl4AIConfig {
  const log = options?.log || (() => {});
  const resolved = loadConfigFromFile(options?.cwd);

  // Build adapters list
  const customAdapters: ProxyAdapter[] = [];

  // If we have proxy config from JSON file or env vars, create a custom adapter
  if (resolved.proxyUrl || (resolved.proxyHost && (resolved.proxyPort || resolved.proxyPorts))) {
    // Add user- prefix for Oxylabs
    const username = resolved.proxyProvider === "oxylabs" && resolved.proxyUsername
      ? (resolved.proxyUsername.startsWith("user-") ? resolved.proxyUsername : `user-${resolved.proxyUsername}`)
      : resolved.proxyUsername;

    // Build endpoints for rotation if multiple ports provided
    let endpoints: ProxyEndpoint[] | undefined;

    if (resolved.proxyPorts && resolved.proxyPorts.length > 0) {
      endpoints = resolved.proxyPorts.map((port, index) => ({
        id: `custom-${port}`,
        server: `http://${resolved.proxyHost || "proxy"}:${port}`,
        username,
        password: resolved.proxyPassword,
        provider: resolved.proxyProvider || "custom",
        metadata: { port, index },
      }));
    }

    customAdapters.push(
      createCustomAdapter({
        url: resolved.proxyUrl,
        host: resolved.proxyHost,
        port: resolved.proxyPort,
        username,
        password: resolved.proxyPassword,
        endpoints, // Pass pre-built endpoints for rotation
      })
    );
    log("info", "Using proxy from config");
  }

  const proxyService = createProxyService({
    customAdapters,
    log,
  });

  return {
    baseUrl: resolved.baseUrl,
    timeout: resolved.timeout,
    proxyService,
    proxyEnabled: proxyService.isEnabled(),
    raw: resolved,
  };
}

/**
 * Build browser config for crawl4ai with optional proxy.
 */
export function buildBrowserConfig(config: Crawl4AIConfig): Record<string, unknown> {
  return config.proxyService.getBrowserConfig();
}
