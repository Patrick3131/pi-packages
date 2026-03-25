/**
 * pi-crawl4ai - Pi extension for web crawling with crawl4ai
 *
 * This extension provides a `crawl` tool that uses crawl4ai for
 * browser-rendered web scraping with optional proxy support.
 *
 * Configuration (environment variables):
 * - CRAWL4AI_BASE_URL: crawl4ai Docker API URL (default: http://localhost:11235)
 * - CRAWL4AI_TIMEOUT: Request timeout in ms (default: 60000)
 *
 * Proxy configuration (environment variables):
 * - CRAWL4AI_PROXY_URL: Full proxy URL (e.g., http://user:pass@host:port)
 * - OXYLABS_USER + OXYLABS_PASS: Oxylabs ISP proxy credentials
 *
 * Or use JSON config file (takes priority over env vars):
 * - .pi/crawl4ai.json in project directory
 * - ~/.pi/agent/extensions/crawl4ai.json for global config
 *
 * @example JSON config file
 * ```json
 * {
 *   "url": "http://localhost:11235",
 *   "timeoutMs": 60000,
 *   "proxy": {
 *     "url": "http://user:pass@proxy.example.com:8080"
 *   },
 *   "tools": ["crawl"]
 * }
 * ```
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { registerCrawlTool } from "./features/crawl/crawlTool";

export { loadConfig } from "./config";
export { loadConfig as loadConfigFromFile, type Crawl4AIJsonConfig, type ResolvedConfig } from "./configLoader";
export { createProxyService, type ProxyAdapter, type ProxyConfig, type ProxyService } from "./proxy";
export { genericAdapter, oxylabsAdapter, createCustomAdapter } from "./proxy/adapters";
export { registerCrawlTool } from "./features/crawl/crawlTool";
export * from "./features/crawl/types";

/**
 * Extension entry point.
 */
export default function (pi: ExtensionAPI) {
  // Load configuration from JSON file and/or environment
  const config = loadConfig({
    log: (level, message) => {
      console.log(`[pi-crawl4ai:${level}] ${message}`);
    },
  });

  // Log startup info
  console.log(`[pi-crawl4ai] Initialized with baseUrl: ${config.baseUrl}`);

  if (config.proxyEnabled) {
    const adapterName = config.proxyService.getActiveAdapterName();
    const proxyConfig = config.proxyService.getProxyConfig();
    console.log(`[pi-crawl4ai] Proxy enabled via ${adapterName} adapter: ${proxyConfig?.server}`);
  } else {
    console.log(`[pi-crawl4ai] Proxy disabled (no adapter configured)`);
  }

  // Register tools
  registerCrawlTool(pi, config);
}
