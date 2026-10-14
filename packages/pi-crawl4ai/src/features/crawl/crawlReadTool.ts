import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { getDefaultOutputDir } from "./saveOutput";
import { executeCrawlRead, DEFAULT_MAX_CHARS } from "./crawlReadCore";
export { executeCrawlRead, resolveReadablePath, buildManifestOverview } from "./crawlReadCore";
export type { CrawlReadParams, CrawlReadMode } from "./crawlReadCore";

export function registerCrawlReadTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool(defineTool({
    name: "crawl_read",
    label: "Read Crawl Output",
    description:
      "Progressively read a saved crawl page without dumping the whole file into context. " +
      "The path may be an exact page path, crawl-manifest.json, session directory, or page URL; " +
      "use url with a manifest/session path to resolve a page. " +
      "Modes: outline (default), chunks (optional query), window (line range), full (hard-capped). " +
      "Prefer this over raw read for files under output-crawl4ai.",
    promptSnippet:
      "Read saved crawl pages or resolve a page URL through crawl-manifest.json via outline/chunks/window/full.",
    promptGuidelines: [
      "After a crawl that saved files, read crawl-manifest.json first or use an exact printed page path; never invent flattened filenames.",
      "You can pass a page URL in path, or pass url with a manifest/session path; missing paths are errors and list valid saved paths.",
      "Use chunks with a query for focused reading; outline is optional, and window/full expose exact saved text.",
      "Use mode=window or mode=full only when you need exact text; full is hard-capped by maxChars.",
    ],
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({
          description:
            "Exact path to a saved page, crawl-manifest.json, or session directory; may also be a page URL. Relative paths resolve from cwd or outputDir.",
        })
      ),
      url: Type.Optional(
        Type.String({
          description:
            "Page URL to resolve through the manifest at path, or search saved crawl sessions when path is omitted.",
        })
      ),
      mode: Type.Optional(
        Type.Union(
          [
            Type.Literal("outline"),
            Type.Literal("chunks"),
            Type.Literal("window"),
            Type.Literal("full"),
          ],
          {
            description:
              "outline (default without query), chunks (default with query), window, or full",
          }
        )
      ),
      query: Type.Optional(
        Type.String({
          description: "Relevance query for mode=chunks (keyword ranking over sections)",
        })
      ),
      maxChars: Type.Optional(
        Type.Number({
          description: `Max characters returned (default ${DEFAULT_MAX_CHARS})`,
          minimum: 0,
        })
      ),
      offset: Type.Optional(
        Type.Number({
          description: "1-based start line for mode=window (default 1)",
          minimum: 1,
        })
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Number of lines for mode=window (default 80)",
          minimum: 1,
        })
      ),
    }),

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
