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
import { registerCrawlReadTool } from "./features/crawl/crawlReadTool";
import {
  cleanupCrawlSessions,
  formatCleanupSummary,
  listCrawlSessions,
} from "./features/crawl/cleanup";
import { getDefaultOutputDir } from "./features/crawl/saveOutput";

export { loadConfig } from "./config";
export { loadConfig as loadConfigFromFile, type Crawl4AIJsonConfig, type ResolvedConfig } from "./configLoader";
export { createProxyService, type ProxyAdapter, type ProxyConfig, type ProxyService } from "./proxy";
export { genericAdapter, oxylabsAdapter, createCustomAdapter } from "./proxy/adapters";
export { registerCrawlTool } from "./features/crawl/crawlTool";
export { registerCrawlReadTool, executeCrawlRead } from "./features/crawl/crawlReadTool";
export * from "./features/crawl/types";
export * from "./features/crawl/outline";

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

  // Register tools (exist but may not be active until /crawl-on)
  registerCrawlTool(pi, config);
  registerCrawlReadTool(pi, config);

  const CRAWL_TOOL_NAMES = ["crawl", "crawl_read"] as const;

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
    const anyCrawlActive = CRAWL_TOOL_NAMES.some((name) => activeNames.includes(name));

    if (crawlEnabled) {
      const missing = CRAWL_TOOL_NAMES.filter((name) => !activeNames.includes(name));
      if (missing.length > 0) {
        pi.setActiveTools([...activeNames, ...missing]);
      }
      return;
    }

    if (!crawlEnabled && anyCrawlActive) {
      if (options?.preserveExplicitSelection) {
        return;
      }

      pi.setActiveTools(activeNames.filter((n) => !CRAWL_TOOL_NAMES.includes(n as (typeof CRAWL_TOOL_NAMES)[number])));
    }
  }

  function wasToolExplicitlyRequested(): boolean {
    const activeTools = pi.getActiveTools();
    if (CRAWL_TOOL_NAMES.some((name) => activeTools.includes(name))) {
      return true;
    }

    for (let index = 0; index < process.argv.length; index += 1) {
      const arg = process.argv[index];
      if (arg === "--tools") {
        const value = process.argv[index + 1] ?? "";
        const requested = value.split(",").map((entry) => entry.trim());
        if (CRAWL_TOOL_NAMES.some((name) => requested.includes(name))) {
          return true;
        }
      }

      if (arg.startsWith("--tools=")) {
        const value = arg.slice("--tools=".length);
        const requested = value.split(",").map((entry) => entry.trim());
        if (CRAWL_TOOL_NAMES.some((name) => requested.includes(name))) {
          return true;
        }
      }
    }

    return false;
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

    const explicitToolSelectionRequested = !hasPersistedState && wasToolExplicitlyRequested();

    // Explicit CLI selection (e.g. --tools crawl) is honored even when lazy
    // activation is otherwise off and no branch state has been persisted yet.
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

  const outputRoot = () => getDefaultOutputDir(config.raw.outputDir);

  // List saved crawl sessions
  pi.registerCommand("crawl-sessions", {
    description: "List saved crawl sessions under the output directory",
    handler: async (_args, ctx) => {
      const root = outputRoot();
      const sessions = listCrawlSessions(root);
      if (sessions.length === 0) {
        ctx.ui.notify(`No crawl sessions in ${root}`, "info");
        return;
      }
      const lines = sessions.map((session, index) => {
        const mb = (session.sizeBytes / (1024 * 1024)).toFixed(2);
        const when = session.timestamp ?? new Date(session.mtimeMs).toISOString();
        return `${index + 1}. ${session.name}  ${mb} MB  ${when}`;
      });
      ctx.ui.notify(`Crawl sessions in ${root} (${sessions.length}):\n${lines.join("\n")}`, "info");
    },
  });

  // Manual retention cleanup
  pi.registerCommand("crawl-cleanup", {
    description:
      "Prune old crawl sessions (usage: /crawl-cleanup [dry-run]). Uses retention maxSessions/maxAgeDays/maxTotalMb.",
    handler: async (args, ctx) => {
      const root = outputRoot();
      const dryRun = /\bdry-?run\b/i.test(args ?? "");
      const policy = { ...config.raw.retention, enabled: true };
      const result = cleanupCrawlSessions(root, policy, { dryRun });
      const summary = formatCleanupSummary(result, dryRun);
      console.log(`[pi-crawl4ai] ${summary}`);
      ctx.ui.notify(summary, result.deleted.length > 0 ? "warning" : "info");
    },
  });
}
