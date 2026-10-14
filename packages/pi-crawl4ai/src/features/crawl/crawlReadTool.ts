import { crawlReadToolDefinition } from "./crawlReadToolDefinition";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { getDefaultOutputDir } from "./saveOutput";
import { executeCrawlRead, DEFAULT_MAX_CHARS } from "./crawlReadCore";
export { executeCrawlRead, resolveReadablePath, buildManifestOverview } from "./crawlReadCore";
export type { CrawlReadParams, CrawlReadMode } from "./crawlReadCore";

export function registerCrawlReadTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool(defineTool({
    ...crawlReadToolDefinition,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new Error("Crawl read cancelled");
      const result = executeCrawlRead(params, {
        outputRoot: config.raw.outputDir,
        cwd: ctx?.cwd ?? process.cwd(),
      });
      if (result.details.error) {
        // Throw so Pi records missing paths as tool errors rather than successful
        // results that merely contain an "Error:" string.
        throw new Error(result.text);
      }
      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  }));
}
