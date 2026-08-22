/**
 * pi-crawl4ai - Pi extension for web crawling with crawl4ai
 *
 * This extension provides a `crawl` tool that uses crawl4ai for
 * browser-rendered web scraping.
 *
 * Egress/proxy is owned by the crawl4ai server (operator pinning proxy).
 * This client never sends proxy credentials in the request body.
 *
 * Startup on/off is owned by `.pi/tools.json` (`/tools`). This package only
 * registers the tools. Use `/crawl-on` / `/crawl-off` for the current session.
 *
 * Configuration (environment variables):
 * - CRAWL4AI_BASE_URL: crawl4ai Docker API URL (default: http://localhost:11235)
 * - CRAWL4AI_TIMEOUT: Request timeout in ms (default: 60000)
 * - CRAWL4AI_API_TOKEN: bearer token for crawl4ai Docker/API auth (Authorization: Bearer …)
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
 *   "apiToken": "${CRAWL4AI_API_TOKEN}"
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
export { registerCrawlTool } from "./features/crawl/crawlTool";
export { registerCrawlReadTool, executeCrawlRead } from "./features/crawl/crawlReadTool";
export * from "./features/crawl/types";
export * from "./features/crawl/outline";

/**
 * Extension entry point.
 */
export default function (pi: ExtensionAPI) {
  const config = loadConfig({
    log: (level, message) => {
      console.log(`[pi-crawl4ai:${level}] ${message}`);
    },
  });

  console.log(`[pi-crawl4ai] Initialized with baseUrl: ${config.baseUrl}`);
  console.log(`[pi-crawl4ai] Egress is server-managed (client does not send proxy config)`);

  registerCrawlTool(pi, config);
  registerCrawlReadTool(pi, config);

  const CRAWL_TOOL_NAMES = ["crawl", "crawl_read"] as const;

  function setCrawlToolsActive(enabled: boolean) {
    const activeNames = pi.getActiveTools();
    if (enabled) {
      const missing = CRAWL_TOOL_NAMES.filter((name) => !activeNames.includes(name));
      if (missing.length > 0) {
        pi.setActiveTools([...activeNames, ...missing]);
      }
      return;
    }
    const next = activeNames.filter(
      (name) => !CRAWL_TOOL_NAMES.includes(name as (typeof CRAWL_TOOL_NAMES)[number]),
    );
    if (next.length !== activeNames.length) {
      pi.setActiveTools(next);
    }
  }

  pi.registerCommand("crawl-on", {
    description: "Enable the crawl tools for this session (does not write .pi/tools.json)",
    handler: async (_args, ctx) => {
      setCrawlToolsActive(true);
      ctx.ui.notify("Crawl tools enabled for this session", "info");
    },
  });

  pi.registerCommand("crawl-off", {
    description: "Disable the crawl tools for this session (does not write .pi/tools.json)",
    handler: async (_args, ctx) => {
      setCrawlToolsActive(false);
      ctx.ui.notify("Crawl tools disabled for this session", "info");
    },
  });

  const outputRoot = () => getDefaultOutputDir(config.raw.outputDir);

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
