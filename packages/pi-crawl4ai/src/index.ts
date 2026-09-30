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
 * registers capabilities only; activation remains owned by /tools and presets.
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

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config";
import { registerCrawlTool } from "./features/crawl/crawlTool";
import { registerCrawlReadTool } from "./features/crawl/crawlReadTool";
import {
  cleanupCrawlSessions,
  formatCleanupSummary,
  listCrawlSessions,
} from "./features/crawl/cleanup";
import { getDefaultOutputDir } from "./features/crawl/saveOutput";
import { formatCrawlSessionDrillDown, resolveCrawlSession } from "./features/crawl/sessions";
import { resolve } from "node:path";
import { createCrawlDeadline, fetchCrawlApi, redactError } from "./features/crawl/http";
import { extractWithTrafilatura } from "./features/crawl/trafilatura";

export { loadConfig } from "./config";
export type { Crawl4AIJsonConfig, ResolvedConfig } from "./config";
export { registerCrawlTool } from "./features/crawl/crawlTool";
export { registerCrawlReadTool, executeCrawlRead } from "./features/crawl/crawlReadTool";
export * from "./features/crawl/types";
export * from "./features/crawl/outline";

/**
 * Extension entry point.
 */
export default function (pi: ExtensionAPI) {
  const config = loadConfig();

  registerCrawlTool(pi, config);
  registerCrawlReadTool(pi, config);

  pi.registerCommand("crawl-status", {
    description: "Check service health on demand; add extractor to check optional Python extraction",
    handler: async (args, ctx) => {
      const operation = createCrawlDeadline(Math.min(config.timeout, 5000), ctx.signal);
      let message: string;
      let failed = false;
      try {
        const health = await fetchCrawlApi(config, "/health", { method: "GET" }, operation.signal);
        let parsed: unknown;
        try { parsed = JSON.parse(health); } catch { throw new Error("Invalid service health JSON"); }
        if (!parsed || typeof parsed !== "object") throw new Error("Invalid service health response");
        message = `crawl4ai service reachable. ${redactError(health, config).slice(0, 500)}\nEgress is server-managed. HTTP cancellation may not cancel server-side browser work.`;
        if (/\bextractor\b/i.test(args)) {
          const pythonPath = config.raw.trafilatura?.pythonPath;
          if (!pythonPath) throw new Error("Configure trafilatura.pythonPath / CRAWL4AI_TRAFILATURA_PYTHON; install trafilatura>=2,<3");
          await extractWithTrafilatura({ pythonPath, html: `<html><body><article><h1>Availability check</h1><p>${"This is a local extractor availability check. ".repeat(30)}</p></article></body></html>`, format: "text", deadline: operation.deadline, signal: operation.signal });
          message += "\nTrafilatura extraction available.";
        } else message += `\nOptional Python: ${config.raw.trafilatura?.pythonPath ? "configured (not probed; use /crawl-status extractor)" : "not configured; basic crawling unaffected"}.`;
      } catch (error) {
        failed = true;
        message = `crawl-status: ${redactError(error instanceof Error ? error.message : String(error), config)}`;
      } finally { operation.dispose(); }
      if (ctx.hasUI) ctx.ui.notify(message, failed ? "warning" : "info");
      else pi.sendMessage({ customType: "crawl-status", content: message, display: true }, { triggerTurn: false });
    },
  });

  const outputRoot = (cwd: string) => resolve(cwd, getDefaultOutputDir(config.raw.outputDir));

  pi.registerCommand("crawl-sessions", {
    description: "List saved crawl sessions with host/page count; a selector drills in (usage: /crawl-sessions [n|name|prefix])",
    handler: async (args, ctx) => {
      const root = outputRoot(ctx.cwd);
      const sessions = listCrawlSessions(root);
      if (sessions.length === 0) {
        const empty = `No crawl sessions in ${root}`;
        if (ctx.hasUI) ctx.ui.notify(empty, "info");
        else pi.sendMessage({ customType: "crawl-sessions", content: empty, display: true }, { triggerTurn: false });
        return;
      }
      const selector = (args ?? "").trim();
      if (selector) {
        const selection = resolveCrawlSession(selector, sessions, root);
        if (!selection.session) {
          // Selector failures carry no pages; headless runs still surface the error.
          if (ctx.hasUI) ctx.ui.notify(selection.error, "warning");
          else pi.sendMessage({ customType: "crawl-sessions", content: selection.error, display: true }, { triggerTurn: false });
          return;
        }
        pi.sendMessage({ customType: "crawl-sessions", content: formatCrawlSessionDrillDown(selection.session, ctx.cwd), display: true }, { triggerTurn: false });
        return;
      }
      const lines = sessions.map((session, index) => {
        const mb = (session.sizeBytes / (1024 * 1024)).toFixed(2);
        const when = session.timestamp ?? new Date(session.mtimeMs).toISOString();
        const host = session.host ?? "unknown-host";
        const pageCount = session.pageCount === undefined ? "?" : String(session.pageCount);
        return `${index + 1}. ${session.name}  ${mb} MB  ${host} ×${pageCount}  ${when}`;
      });
      ctx.ui.notify(`Crawl sessions in ${root} (${sessions.length}):\n${lines.join("\n")}`, "info");
    },
  });

  pi.registerCommand("crawl-cleanup", {
    description:
      "Prune old crawl sessions (usage: /crawl-cleanup [dry-run]). Uses retention maxSessions/maxAgeDays/maxTotalMb.",
    handler: async (args, ctx) => {
      const root = outputRoot(ctx.cwd);
      const dryRun = /\bdry-?run\b/i.test(args ?? "");
      const policy = { ...config.raw.retention, enabled: true };
      const result = cleanupCrawlSessions(root, policy, { dryRun });
      const summary = formatCleanupSummary(result, dryRun);
      ctx.ui.notify(summary, result.deleted.length > 0 ? "warning" : "info");
    },
  });
}
