/**
 * pi-crawl4ai - Pi extension for web crawling with crawl4ai
 *
 * This extension provides a `crawl` tool that uses crawl4ai for
 * browser-rendered web scraping with optional proxy support.
 *
 * The crawl tool is disabled by default to avoid polluting the system prompt.
 * Use `/crawl-on` to enable it and `/crawl-off` to disable it.
 * Set `enabledByDefault: true` in config to enable at startup.
 * Explicit tool selection (for example `--tools crawl`) is also honored.
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
 *   "enabledByDefault": false,
 *   "proxy": {
 *     "url": "http://user:pass@proxy.example.com:8080"
 *   }
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

// State persisted to session
interface CrawlState {
  enabled: boolean;
}

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

  // Register the crawl tool (exists but may not be active)
  registerCrawlTool(pi, config);

  // Track enabled state (starts based on config setting)
  let crawlEnabled = config.raw.enabledByDefault;

  // Persist current state
  function persistState() {
    pi.appendEntry<CrawlState>("crawl-config", {
      enabled: crawlEnabled,
    });
  }

  // Apply current tool selection.
  // When `preserveExplicitSelection` is true, an already-active `crawl` tool
  // (for example from `--tools crawl`) is left enabled even if lazy activation
  // is otherwise off and no branch state has been persisted yet.
  function applyCrawlState(options?: { preserveExplicitSelection?: boolean }) {
    const activeNames = pi.getActiveTools();
    const crawlAlreadyActive = activeNames.includes("crawl");

    if (crawlEnabled && !crawlAlreadyActive) {
      pi.setActiveTools([...activeNames, "crawl"]);
      return;
    }

    if (!crawlEnabled && crawlAlreadyActive) {
      if (options?.preserveExplicitSelection) {
        return;
      }

      pi.setActiveTools(activeNames.filter((n) => n !== "crawl"));
    }
  }

  // Restore state from session branch (if persisted), then apply current state.
  // On first load, no state is persisted so defaults are used.
  function restoreFromBranch(ctx: { sessionManager: { getBranch: () => unknown[] } }) {
    const branchEntries = ctx.sessionManager.getBranch() as Array<{
      type: string;
      customType?: string;
      data?: { enabled?: boolean };
    }>;
    let hasPersistedState = false;

    for (const entry of branchEntries) {
      if (entry.type === "custom" && entry.customType === "crawl-config") {
        if (entry.data?.enabled !== undefined) {
          crawlEnabled = entry.data.enabled;
          hasPersistedState = true;
        }
      }
    }

    const explicitToolSelectionRequested = !hasPersistedState && pi.getActiveTools().includes("crawl");

    applyCrawlState({ preserveExplicitSelection: explicitToolSelectionRequested });

    // Log current state
    if (crawlEnabled || explicitToolSelectionRequested) {
      console.log(`[pi-crawl4ai] Crawl tool enabled.`);
    } else {
      console.log(`[pi-crawl4ai] Crawl tool disabled. Use /crawl-on to enable.`);
    }
  }

  // Restore and apply state on session_start. This fires after extensions load
  // (runtime is ready), so getActiveTools/setActiveTools work properly.
  pi.on("session_start", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  // Restore state when navigating session tree
  pi.on("session_tree", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  // Restore state after forking
  pi.on("session_fork", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  // Command to enable crawl
  pi.registerCommand("crawl-on", {
    description: "Enable the crawl tool (adds to system prompt)",
    handler: async (_args, ctx) => {
      crawlEnabled = true;
      applyCrawlState();
      persistState();
      ctx.ui.notify("Crawl tool enabled", "info");
    },
  });

  // Command to disable crawl
  pi.registerCommand("crawl-off", {
    description: "Disable the crawl tool (removes from system prompt)",
    handler: async (_args, ctx) => {
      crawlEnabled = false;
      applyCrawlState();
      persistState();
      ctx.ui.notify("Crawl tool disabled", "info");
    },
  });
}
