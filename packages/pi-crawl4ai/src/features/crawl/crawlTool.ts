import { crawlToolDefinition } from "./crawlToolDefinition";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { executeCrawl } from "./crawlCore";
export { buildDeepCrawlStrategy } from "./crawlCore";

export function registerCrawlTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool(defineTool({
    ...crawlToolDefinition,
    async execute(_id, params, signal, onUpdate, ctx) {
      const result = await executeCrawl(params, config, { signal, onUpdate, cwd: ctx?.cwd ?? process.cwd() });
      return { ...result, structuredOutput: result.details.evidence };
    },
  }));
}
