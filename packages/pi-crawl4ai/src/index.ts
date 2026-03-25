/**
 * pi-crawl4ai - Pi extension for web crawling with crawl4ai
 *
 * This extension provides a `crawl` tool that uses crawl4ai for
 * browser-rendered web scraping with optional proxy support.
 *
 * Configuration (environment variables):
 * - CRAWL4AI_BASE_URL: crawl4ai Docker API URL (default: http://localhost:11235)
 * - CRAWL4AI_PROXY_URL: Full proxy URL with auth (e.g., http://user:pass@host:port)
 * - OXYLABS_USER: Oxylabs username (alternative to PROXY_URL)
 * - OXYLABS_PASS: Oxylabs password (alternative to PROXY_URL)
 * - OXYLABS_HOST: Oxylabs host (default: pr.oxylabs.io)
 * - OXYLABS_PORT: Oxylabs port (default: 7777)
 * - CRAWL4AI_TIMEOUT: Request timeout in ms (default: 60000)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { registerCrawlTool } from "./features/crawl/crawlTool";

export { loadConfig } from "./config";
export { registerCrawlTool } from "./features/crawl/crawlTool";
export * from "./features/crawl/types";

/**
 * Extension entry point.
 */
export default function (pi: ExtensionAPI) {
  // Load configuration from environment
  const config = loadConfig();

  // Log startup info
  console.log(`[pi-crawl4ai] Initialized with baseUrl: ${config.baseUrl}`);
  if (config.proxyEnabled) {
    console.log(`[pi-crawl4ai] Proxy enabled: ${config.proxy?.server}`);
  } else {
    console.log(`[pi-crawl4ai] Proxy disabled (no credentials configured)`);
  }

  // Register tools
  registerCrawlTool(pi, config);
}
