import { cardExtractionSchema } from "./crawlInteractToolDefinition";
import { Type } from "typebox";

export const crawlToolDefinition = {

    name: "crawl",
    label: "Crawl Website",
    description: "Crawl known HTTP(S) URLs through the configured browser service; egress is server-managed. Saves complete bodies by default and returns a compact index with exact paths for crawl_read. Examples: {\"urls\":[\"https://example.com/docs\"]}; \"deepCrawl\":{\"maxDepth\":2,\"maxPages\":20,\"allowedDomains\":[\"example.com\"]} for bounded discovery. Inline previews are capped at 12,000 characters; save=false opts out.",
    promptSnippet: "Crawl known URLs; complete files, manifest/index and exact paths by default—then use crawl_read.",
    promptGuidelines: [
      "Pass only urls by default.",
      "Read the crawl-manifest.json or an exact printed page path with crawl_read; never invent flattened filenames.",
      "Use deepCrawl only for cross-page discovery with low maxDepth/maxPages.",
      "Use bm25Query only to narrow one large Markdown page.",
    ],
    parameters: Type.Object({
      urls: Type.Array(Type.String(), { minItems: 1, description: "HTTP(S) URLs; exactly one seed for deepCrawl" }),
      format: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("html"), Type.Literal("links"), Type.Literal("text")], { description: "Default raw markdown; text broadly renders HTML without Python" })),
      waitFor: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Milliseconds to wait after rendering before extraction" })),
      bypassCache: Type.Optional(Type.Boolean()),
      waitForSelector: Type.Optional(Type.String({ description: "Wait for this CSS selector; requires configured acquisition capability" })),
      selector: Type.Optional(Type.String({ description: "CSS region view; uncropped source is preserved" })),
      excludeSelector: Type.Optional(Type.String({ description: "Exclude CSS regions from derived view only" })),
      extractionSchema: Type.Optional(cardExtractionSchema),
      deepCrawl: Type.Optional(Type.Object({
        strategy: Type.Optional(Type.Union([Type.Literal("bfs"), Type.Literal("dfs"), Type.Literal("best-first")], { description: "Traversal order; default bfs" })),
        maxDepth: Type.Integer({ minimum: 1, description: "Link hops from the seed; 1 = seed only" }),
        maxPages: Type.Optional(Type.Integer({ minimum: 1, description: "Attempted fetches including failures; default 10" })),
        includeExternal: Type.Optional(Type.Boolean({ description: "Follow links outside the seed domain; default false" })),
        includePatterns: Type.Optional(Type.Array(Type.String(), { description: "Glob URL patterns to include; not regex" })),
        excludePatterns: Type.Optional(Type.Array(Type.String(), { description: "Glob URL patterns to exclude; not regex" })),
        allowedDomains: Type.Optional(Type.Array(Type.String(), { description: "Restrict traversal to these domains" })),
        scoreThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: "best-first only" })),
      })),
      save: Type.Optional(Type.Union([Type.Boolean(), Type.String()], { description: "Default saves; false opts out; string = custom directory" })),
      returnMode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("inline"), Type.Literal("files")], { description: "auto returns file references; inline previews; files requires saving" })),
      maxCharsPerPage: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Body preview characters per page (at most 12000)" })),
      maxCharsPerCall: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Total body preview characters (at most 12000)" })),
      preferFitMarkdown: Type.Optional(Type.Boolean()),
      bm25Query: Type.Optional(Type.String({ description: "Keep only matching sections; one URL, Markdown/text only; not with deepCrawl" })),
      bm25Threshold: Type.Optional(Type.Number({ minimum: 0, description: "Default 1; requires bm25Query" })),
      includeLinks: Type.Optional(Type.Boolean({ description: "Keep useful link targets in ordinary output" })),
    }, { additionalProperties: false }),
};
