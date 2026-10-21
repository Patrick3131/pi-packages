import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { crawlInteractToolDefinition } from "./crawlInteractToolDefinition";
import { executeCrawlInteract } from "./crawlCapabilities";

export function registerCrawlInteractTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  if (!config.raw.capabilities?.interaction) return;
  pi.registerTool(defineTool({
    ...crawlInteractToolDefinition,
    async execute(_id, params, signal, _onUpdate, ctx) {
      const result = await executeCrawlInteract(params, config, { signal, cwd: ctx?.cwd ?? process.cwd() });
      return { ...result, structuredOutput: result.details.evidence };
    },
  }));
}
