import { ReadEvidenceSchema } from "./evidence";
import { Type } from "typebox";
import { DEFAULT_MAX_CHARS } from "./crawlReadCore";

export const crawlReadToolDefinition = {

    name: "crawl_read",
    structuredOutputSchema: ReadEvidenceSchema,
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
      charOffset: Type.Optional(Type.Integer({ minimum: 0, description: "UTF-16 character offset; use the exact nextCall returned by a previous read" })),
      revision: Type.Optional(Type.String({ description: "Required artifact SHA-256 for continuation" })),
      viewId: Type.Optional(Type.String({ description: "Exact view identity returned by a previous read" })),
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
};
