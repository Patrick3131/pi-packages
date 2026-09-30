import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import type { Crawl4AIConfig } from "../../config";
import type { CrawlToolParams, Crawl4AIResponse, DeepCrawlConfig } from "./types";
import { applyRequestPacing } from "./requestPacing";
import { createCrawlDeadline, fetchCrawlApi, redactError } from "./http";
import { resolveOutputDir, saveCrawlResultsDetailed, createCrawlSession, writeCrawlArtifact, urlToFilePath, formatContentForSave, type SaveCrawlOptions } from "./saveOutput";
import { DEFAULT_TOKEN_BUDGET, buildBudgetedToolText, decideReturnMode, slimResultDetails, toFormattedPages, capToolText, type TokenBudgetConfig } from "./tokenBudget";
import { filterMarkdownBm25 } from "./bm25";
import { extractWithTrafilatura } from "./trafilatura";

export function buildDeepCrawlStrategy(config: DeepCrawlConfig, defaultMaxPages: number): Record<string, unknown> {
  const names = { bfs: "BFSDeepCrawlStrategy", dfs: "DFSDeepCrawlStrategy", "best-first": "BestFirstCrawlingStrategy" };
  const filters: Record<string, unknown>[] = [];
  if (config.includePatterns?.length) filters.push({ type: "URLPatternFilter", params: { patterns: config.includePatterns, use_glob: true } });
  if (config.excludePatterns?.length) filters.push({ type: "URLPatternFilter", params: { patterns: config.excludePatterns, use_glob: true, reverse: true } });
  if (config.allowedDomains?.length) filters.push({ type: "DomainFilter", params: { allowed_domains: config.allowedDomains } });
  return {
    type: names[config.strategy ?? "bfs"],
    params: {
      // Upstream seed depth is zero; the public API retains seed-only depth=1.
      max_depth: config.maxDepth - 1,
      max_pages: config.maxPages ?? defaultMaxPages,
      include_external: config.includeExternal ?? false,
      ...(filters.length ? { filter_chain: { type: "FilterChain", params: { filters } } } : {}),
      ...(config.scoreThreshold !== undefined ? { score_threshold: config.scoreThreshold } : {}),
    },
  };
}

function validateParams(params: CrawlToolParams, config: Crawl4AIConfig): void {
  if (!Array.isArray(params.urls) || !params.urls.length) throw new Error("At least one HTTP(S) URL is required");
  for (const value of params.urls) {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Targets must be HTTP(S) URLs without embedded credentials");
  }
  if (params.deepCrawl && params.urls.length !== 1) throw new Error("Deep crawling requires exactly one start URL");
  for (const [name, value] of Object.entries({ waitFor: params.waitFor, maxCharsPerPage: params.maxCharsPerPage, maxCharsPerCall: params.maxCharsPerCall, maxDepth: params.deepCrawl?.maxDepth, maxPages: params.deepCrawl?.maxPages })) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`${name} must be positive and finite`);
  }
  if (params.deepCrawl) {
    const deep = params.deepCrawl;
    if (!Number.isInteger(deep.maxDepth) || (deep.maxPages !== undefined && !Number.isInteger(deep.maxPages))) throw new Error("Deep depth/page counts must be integers");
    if (deep.strategy && !["bfs", "dfs", "best-first"].includes(deep.strategy)) throw new Error("Unsupported deep strategy");
    if (deep.scoreThreshold !== undefined && (deep.strategy !== "best-first" || !Number.isFinite(deep.scoreThreshold) || deep.scoreThreshold < 0 || deep.scoreThreshold > 1)) throw new Error("scoreThreshold requires best-first and a finite value in [0,1]");
    for (const list of [deep.includePatterns, deep.excludePatterns, deep.allowedDomains]) {
      if (list !== undefined && (!Array.isArray(list) || list.some(value => typeof value !== "string" || !value.trim()))) throw new Error("Deep filters must contain nonblank strings");
    }
  }
  const format = params.format ?? "markdown";
  if (!["markdown", "html", "links", "text"].includes(format)) throw new Error("Unsupported format");
  if (params.returnMode && !["auto", "inline", "files"].includes(params.returnMode)) throw new Error("Unsupported returnMode");
  if (params.save === false && (params.returnMode ?? config.raw.tokenBudget.returnMode) === "files") throw new Error("returnMode=files is incompatible with save=false");
  if (typeof params.save === "string" && !params.save.trim()) throw new Error("Save directory must not be blank");
  if (params.bm25Query !== undefined && (!params.bm25Query.trim() || params.urls.length !== 1 || params.deepCrawl || !["markdown", "text"].includes(format))) throw new Error("BM25 requires a nonblank query, one URL, Markdown/text and no deep crawl");
  if (params.bm25Threshold !== undefined && (!params.bm25Query?.trim() || !Number.isFinite(params.bm25Threshold) || params.bm25Threshold < 0)) throw new Error("bm25Threshold requires a query and a finite nonnegative value");
  if (params.extractor !== undefined && params.extractor !== "trafilatura") throw new Error("Unsupported extractor");
  if (format === "text" && !params.extractor) throw new Error("text format requires extractor=trafilatura");
  if (params.includeLinks !== undefined && !params.extractor) throw new Error("includeLinks requires extractor=trafilatura");
  if (params.extractor) {
    if (!["markdown", "text"].includes(format)) throw new Error("Trafilatura supports Markdown/text only");
    if (params.save === false) throw new Error("Trafilatura requires saving raw HTML; save=false is incompatible");
    if (!config.raw.trafilatura?.pythonPath) throw new Error("Configure trafilatura.pythonPath or CRAWL4AI_TRAFILATURA_PYTHON with Python and trafilatura>=2,<3");
  }
}

function validateResponse(data: unknown): asserts data is Crawl4AIResponse {
  if (!data || typeof data !== "object" || typeof (data as Crawl4AIResponse).success !== "boolean") throw new Error("Malformed crawl4ai response envelope");
  const response = data as Crawl4AIResponse;
  if (!response.success) throw new Error("Crawl request failed");
  if (!Array.isArray(response.results) || !response.results.length) throw new Error("Malformed crawl4ai response: no results");
  for (const result of response.results) {
    if (!result || typeof result !== "object" || typeof result.url !== "string" || typeof result.success !== "boolean") throw new Error("Malformed crawl4ai page result");
    if (result.html === null) result.html = undefined;
    if (result.markdown === null) result.markdown = undefined;
    if (result.metadata === null) result.metadata = undefined;
    if (result.links === null) result.links = undefined;
    // Cached 0.9.4 results use null for absent optional fields; internal consumers use undefined.
    if (result.error_message === null) result.error_message = undefined;
    if (result.status_code === null) result.status_code = undefined;
    if (result.response_headers === null) result.response_headers = undefined;
    if (result.html !== undefined && typeof result.html !== "string") throw new Error("Malformed crawl4ai HTML");
    if (result.markdown !== undefined && typeof result.markdown !== "string") {
      if (result.markdown.fit_markdown === null) result.markdown.fit_markdown = undefined;
      if (result.markdown.fit_html === null) result.markdown.fit_html = undefined;
      if (!result.markdown || typeof result.markdown !== "object" || typeof result.markdown.raw_markdown !== "string" || (result.markdown.fit_markdown !== undefined && typeof result.markdown.fit_markdown !== "string")) throw new Error("Malformed crawl4ai Markdown");
    }
    if (result.metadata !== undefined) {
      if (!result.metadata || typeof result.metadata !== "object" || Array.isArray(result.metadata)) throw new Error("Malformed crawl4ai metadata");
      if (result.metadata.title === null) result.metadata.title = undefined;
      if (result.metadata.description === null) result.metadata.description = undefined;
      if (result.metadata.keywords === null) result.metadata.keywords = undefined;
      if (result.metadata.author === null) result.metadata.author = undefined;
      if (result.metadata.depth === null) result.metadata.depth = undefined;
      if (result.metadata.parent_url === null) result.metadata.parent_url = undefined;
      if (result.metadata.title !== undefined && typeof result.metadata.title !== "string") throw new Error("Malformed crawl4ai metadata");
    }
    if (result.status_code !== undefined && (!Number.isInteger(result.status_code) || !Number.isFinite(result.status_code))) throw new Error("Malformed crawl4ai HTTP status");
    if (result.response_headers !== undefined && (typeof result.response_headers !== "object" || Array.isArray(result.response_headers) || Object.values(result.response_headers).some(value => typeof value !== "string"))) throw new Error("Malformed crawl4ai response headers");
    if (result.error_message !== undefined && typeof result.error_message !== "string") throw new Error("Malformed crawl4ai page error");
    if (result.links !== undefined && (!result.links || [result.links.internal, result.links.external].some(list => !Array.isArray(list) || list.some(link => !link || typeof link.href !== "string" || typeof link.text !== "string")))) throw new Error("Malformed crawl4ai links");
  }
}

function resolveBudget(config: Crawl4AIConfig, params: CrawlToolParams): TokenBudgetConfig {
  const defaults = config.raw.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  return {
    ...defaults,
    maxCharsPerPage: Math.min(12000, params.maxCharsPerPage ?? defaults.maxCharsPerPage),
    maxCharsPerCall: Math.min(12000, params.maxCharsPerCall ?? defaults.maxCharsPerCall),
    returnMode: params.returnMode ?? defaults.returnMode,
    preferFitMarkdown: params.preferFitMarkdown ?? defaults.preferFitMarkdown,
  };
}

export function registerCrawlTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool(defineTool({
    name: "crawl",
    label: "Crawl Website",
    description: "Crawl known HTTP(S) URLs through the configured browser service; egress is server-managed. Saves complete bodies by default and returns a compact index with exact paths for crawl_read. Explicit inline previews are capped at 12,000 total body characters; save=false opts out. Optional single-page BM25 and configured local Trafilatura cleanup retain originals.",
    promptSnippet: "Crawl known URLs; complete files, manifest/index and exact paths by default—then use crawl_read.",
    promptGuidelines: [
      "Read the crawl-manifest.json or an exact printed page path with crawl_read; never invent flattened filenames.",
      "Use inline for bounded previews; save=false forfeits recovery of omitted content.",
      "Use deepCrawl only when needed, with low maxDepth/maxPages; unsupported servers return an actionable error.",
    ],
    parameters: Type.Object({
      urls: Type.Array(Type.String(), { minItems: 1, description: "HTTP(S) URLs; one seed for deep crawl" }),
      format: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("html"), Type.Literal("links"), Type.Literal("text")])),
      waitFor: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Milliseconds to wait after rendering before extraction" })),
      jsCode: Type.Optional(Type.String()),
      bypassCache: Type.Optional(Type.Boolean()),
      deepCrawl: Type.Optional(Type.Object({
        strategy: Type.Optional(Type.Union([Type.Literal("bfs"), Type.Literal("dfs"), Type.Literal("best-first")])),
        maxDepth: Type.Integer({ minimum: 1, description: "1 = seed only" }),
        maxPages: Type.Optional(Type.Integer({ minimum: 1 })),
        includeExternal: Type.Optional(Type.Boolean()),
        includePatterns: Type.Optional(Type.Array(Type.String())),
        excludePatterns: Type.Optional(Type.Array(Type.String())),
        allowedDomains: Type.Optional(Type.Array(Type.String())),
        scoreThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
      })),
      save: Type.Optional(Type.Union([Type.Boolean(), Type.String()], { description: "Default saves; false opts out; string selects a custom directory" })),
      returnMode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("inline"), Type.Literal("files")], { description: "auto returns file references; inline previews; files requires saving" })),
      maxCharsPerPage: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Legacy smaller preview cap" })),
      maxCharsPerCall: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Legacy smaller total preview cap (at most 12000)" })),
      preferFitMarkdown: Type.Optional(Type.Boolean()),
      bm25Query: Type.Optional(Type.String()),
      bm25Threshold: Type.Optional(Type.Number({ minimum: 0, description: "Default 1; requires bm25Query" })),
      extractor: Type.Optional(Type.Literal("trafilatura")),
      includeLinks: Type.Optional(Type.Boolean({ description: "Trafilatura links (default false)" })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      validateParams(params, config);
      const operation = createCrawlDeadline(config.timeout, signal);
      const budget = resolveBudget(config, params);
      const format = params.format ?? "markdown";
      const cwd = ctx?.cwd ?? process.cwd();
      const selectedDir = resolveOutputDir(params.save, config.raw.outputDir);
      const outputDir = selectedDir ? resolve(cwd, selectedDir) : undefined;
      const artifacts: NonNullable<SaveCrawlOptions["artifacts"]> = [];
      let sessionDir: string | undefined;
      let recoveryHtmlPath: string | undefined;
      try {
        if (operation.signal.aborted) throw operation.signal.reason;
        onUpdate?.({ content: [{ type: "text", text: "Waiting for crawl service…" }], details: undefined });
        const pacing = await applyRequestPacing(config, operation.signal);
        const crawlerParams: Record<string, unknown> = {
          cache_mode: { type: "CacheMode", params: params.bypassCache ? "bypass" : "enabled" },
        };
        if (params.waitFor !== undefined) crawlerParams.delay_before_return_html = params.waitFor / 1000;
        if (params.jsCode) crawlerParams.js_code = [params.jsCode];
        if (params.deepCrawl) crawlerParams.deep_crawl_strategy = buildDeepCrawlStrategy(params.deepCrawl, budget.deepCrawlDefaultMaxPages);
        const raw = await fetchCrawlApi(config, "/crawl", {
          method: "POST",
          body: JSON.stringify({ urls: params.urls, crawler_config: { type: "CrawlerRunConfig", params: crawlerParams } }),
        }, operation.signal);
        let data: unknown;
        try { data = JSON.parse(raw); } catch { throw new Error("Malformed crawl4ai JSON response"); }
        validateResponse(data);
        if (data.results.every(result => !result.success)) throw new Error(`All pages failed: ${data.results.map(result => `${result.url}: ${result.error_message ?? "Unknown error"}`).join("; ")}`);
        // Redact server-provided diagnostics before either rendering or persistence.
        for (const result of data.results) if (result.error_message) result.error_message = redactError(result.error_message, config);
        const partial = data.results.some(result => !result.success);
        onUpdate?.({ content: [{ type: "text", text: "Saving complete crawl content…" }], details: undefined });
        for (const [index, result] of data.results.entries()) {
          const artifact: NonNullable<SaveCrawlOptions["artifacts"]>[number] = {};
          artifacts.push(artifact);
          if (!result.success) continue;
          if (params.extractor) {
            if (!outputDir) throw new Error("Trafilatura requires saved raw HTML");
            sessionDir ??= createCrawlSession(outputDir, params.urls);
            artifact.rawHtmlFile = `${index}-${urlToFilePath(result.url, "html")}.raw.html`;
            recoveryHtmlPath = writeCrawlArtifact(sessionDir, artifact.rawHtmlFile, result.html ?? "");
            try {
              if (!result.html) throw new Error("Server returned no rendered HTML");
              result.markdown = await extractWithTrafilatura({ pythonPath: config.raw.trafilatura!.pythonPath!, html: result.html, format: format === "text" ? "text" : "markdown", includeLinks: params.includeLinks, signal: operation.signal, deadline: operation.deadline });
            } catch (error) { throw new Error(`Trafilatura extraction failed: ${error instanceof Error ? error.message : String(error)}`); }
            artifact.extractor = { name: "trafilatura", includeLinks: params.includeLinks ?? false };
          }
          if (params.bm25Query) {
            const source = formatContentForSave(result, format, { preferFitMarkdown: budget.preferFitMarkdown });
            const filtered = filterMarkdownBm25(source, params.bm25Query, params.bm25Threshold ?? 1);
            artifact.sourceContent = source;
            artifact.filter = { query: filtered.query, threshold: filtered.threshold, matchedSectionCount: filtered.matchedSectionCount, totalSections: filtered.totalSections };
            result.markdown = filtered.content;
          }
        }
        if (operation.signal.aborted) throw operation.signal.reason;
        const pages = toFormattedPages(data.results, format, budget);
        const decision = decideReturnMode({ requestedMode: budget.returnMode, pages, isDeepCrawl: !!params.deepCrawl, urlCount: params.urls.length, maxCharsPerCall: budget.maxCharsPerCall, saveRequested: params.save });
        const saved = outputDir ? saveCrawlResultsDetailed(outputDir, params.urls, data.results, format, params.deepCrawl ? { maxDepth: params.deepCrawl.maxDepth, maxPages: params.deepCrawl.maxPages ?? budget.deepCrawlDefaultMaxPages } : undefined, { preferFitMarkdown: budget.preferFitMarkdown, retention: config.raw.retention, sessionDir, artifacts }) : undefined;
        const savedFiles = saved?.pagePaths.map(page => ({ ...page, relativePath: page.file }));
        const warnings = pages.filter((page, index) => page.success && !page.content.trim() && !artifacts[index]?.filter).map(page => `Empty page content: ${page.url}`);
        const bm25 = artifacts[0]?.filter;
        const filterSummary = bm25 ? `\nBM25 query=${JSON.stringify(bm25.query)}, matched ${bm25.matchedSectionCount}/${bm25.totalSections} sections, threshold=${bm25.threshold}${bm25.matchedSectionCount === 0 ? " (valid empty selection)" : ""}` : "";
        const built = buildBudgetedToolText({ pages, rawResults: data.results, budget, decision, isDeepCrawl: !!params.deepCrawl, maxDepth: params.deepCrawl?.maxDepth, savedPath: saved?.sessionDir, manifestPath: saved?.manifestPath, savedFiles, executionSummary: `*Execution:* egress=server-managed${partial ? " — Partial results (some pages failed)" : ""}${warnings.length ? `\nWarning: ${warnings.join("; ")}` : ""}${filterSummary}` });
        return {
          content: [{ type: "text", text: capToolText(built.text, saved?.manifestPath) }],
          details: {
            results: slimResultDetails(built.pages, data.results, savedFiles), format, egress: "server-managed", execution: { egress: "server-managed" }, partial, warnings, bm25,
            minRequestIntervalMs: pacing?.minRequestIntervalMs, rateLimitWaitedMs: pacing?.waitedMs,
            savedPath: saved?.sessionDir, manifestPath: saved?.manifestPath, savedFiles,
            returnMode: built.mode, returnModeReason: decision.reason, truncated: built.truncated,
            totalOriginalChars: built.totalOriginalChars, totalReturnedChars: built.totalReturnedChars, tokenBudget: budget, cleanup: saved?.cleanup,
            ...(params.deepCrawl ? { deepCrawl: { totalPages: data.results.length, maxDepth: params.deepCrawl.maxDepth, maxPages: params.deepCrawl.maxPages ?? budget.deepCrawlDefaultMaxPages } } : {}),
          },
        };
      } catch (error) {
        throw new Error(`Crawl failed: ${redactError(error instanceof Error ? error.message : String(error), config)}${recoveryHtmlPath ? `. Original HTML: ${recoveryHtmlPath}` : ""}`);
      } finally { operation.dispose(); }
    },
  }));
}
