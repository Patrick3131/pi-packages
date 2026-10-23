import { acquirePages, validateAcquisitionOptions, persistCapabilityViews } from "./crawlCapabilities";
import { htmlToText } from "./htmlText";
import { pageEvidence, evidenceView, jsonProjection } from "./evidence";
import { CrawlOperationError } from "./http";
import { resolve } from "node:path";
import type { Crawl4AIConfig } from "../../config";
import type { CrawlFormat, CrawlToolParams, Crawl4AIResponse, DeepCrawlConfig } from "./types";
import { applyRequestPacing } from "./requestPacing";
import { abortable, createCrawlDeadline, fetchCrawlApi, redactError } from "./http";
import { finalizeCrawlEvidence, credentialFreeBaseUrl, resolveOutputDir, saveCrawlResultsDetailed, createCrawlSession, writeCrawlArtifact, urlToFilePath, formatContentForSave, type CrawlManifestRequest, type SaveCrawlOptions } from "./saveOutput";
import { DEFAULT_PREVIEW_SETTINGS, buildBudgetedToolText, decideReturnMode, slimResultDetails, toFormattedPages, capToolText, capToolTextDetailed, type PreviewSettings } from "./presentation";
import { filterMarkdownBm25 } from "./bm25";

/** Preflight failures are correctable input errors, never website/provider failures. */
export class CrawlValidationError extends Error {
  readonly code = "validation_error";
  constructor(message: string) { super(message); this.name = "CrawlValidationError"; }
}

const DEFAULT_DEEP_MAX_PAGES = 10;

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

/**
 * Effective deep-crawl values for the manifest: strategy, depth and page cap resolved,
 * filters recorded as given.
 */
function effectiveDeepCrawlRequest(config: DeepCrawlConfig): NonNullable<CrawlManifestRequest["deepCrawl"]> {
  return {
    strategy: config.strategy ?? "bfs",
    maxDepth: config.maxDepth,
    maxPages: config.maxPages ?? DEFAULT_DEEP_MAX_PAGES,
    ...(config.includeExternal !== undefined ? { includeExternal: config.includeExternal } : {}),
    ...(config.includePatterns ? { includePatterns: config.includePatterns } : {}),
    ...(config.excludePatterns ? { excludePatterns: config.excludePatterns } : {}),
    ...(config.allowedDomains ? { allowedDomains: config.allowedDomains } : {}),
    ...(config.scoreThreshold !== undefined ? { scoreThreshold: config.scoreThreshold } : {}),
  };
}

/** Effective request values for the manifest; jsCode is a boolean and no secret is included. */
function effectiveCrawlRequest(params: CrawlToolParams, format: CrawlFormat, preferFitMarkdown: boolean): CrawlManifestRequest {
  return {
    format,
    bypassCache: params.bypassCache ?? false,
    preferFitMarkdown,
    ...(params.waitFor !== undefined ? { waitFor: params.waitFor } : {}),
    ...(params.jsCode ? { jsCode: true } : {}),
    ...(params.deepCrawl ? { deepCrawl: effectiveDeepCrawlRequest(params.deepCrawl) } : {}),
    ...(params.bm25Query !== undefined ? { bm25: { query: params.bm25Query, threshold: params.bm25Threshold ?? 1 } } : {}),
  };
}

function validateParams(params: CrawlToolParams, config: Crawl4AIConfig): void {
  validateAcquisitionOptions(params);
  const focused = params.waitForSelector || params.selector || params.excludeSelector || params.extractionSchema;
  if (focused && !config.raw.capabilities?.acquisition) throw new CrawlOperationError("unsupported_capability", "Focused acquisition requires capabilities.acquisition on a compatible operator service");
  if (focused && params.deepCrawl) throw new Error("Focused acquisition and deep traversal are separate operations; discover URLs first, then acquire selected pages");
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
  if (params.save === false && params.returnMode === "files") throw new Error("returnMode=files is incompatible with save=false");
  if (typeof params.save === "string" && !params.save.trim()) throw new Error("Save directory must not be blank");
  if (params.bm25Query !== undefined && (!params.bm25Query.trim() || params.urls.length !== 1 || params.deepCrawl || !["markdown", "text"].includes(format))) throw new Error("BM25 requires a nonblank query, one URL, Markdown/text and no deep crawl");
  if (params.bm25Threshold !== undefined && (!params.bm25Query?.trim() || !Number.isFinite(params.bm25Threshold) || params.bm25Threshold < 0)) throw new Error("bm25Threshold requires a query and a finite nonnegative value");
  if ("extractor" in params) throw new Error("extractor is not supported by crawl; use crawl_read on the saved page");
  if (params.jsCode !== undefined) throw new CrawlOperationError("unsupported_capability", "jsCode is not supported on /crawl. Use crawl_interact for browser JavaScript with a configured interaction endpoint.");

}

export function validateCrawlResponse(data: unknown): asserts data is Crawl4AIResponse {
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
    // The upstream API uses null for absent optional fields; internal consumers use undefined.
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

function resolvePreviewSettings(params: CrawlToolParams): PreviewSettings {
  const defaults = DEFAULT_PREVIEW_SETTINGS;
  return {
    ...defaults,
    maxCharsPerPage: Math.min(12000, params.maxCharsPerPage ?? defaults.maxCharsPerPage),
    maxCharsPerCall: Math.min(12000, params.maxCharsPerCall ?? defaults.maxCharsPerCall),
    returnMode: params.returnMode ?? defaults.returnMode,
    preferFitMarkdown: params.preferFitMarkdown ?? defaults.preferFitMarkdown,
  };
}

export interface CrawlExecutionOptions {
  cwd: string;
  signal?: AbortSignal;
  /** Absolute outer deadline, including completed-source checkpoints. */
  deadlineAt?: number;
  /** Work budget from operation start; strictly smaller than config.timeout. */
  acquisitionTimeoutMs?: number;
  onCheckpoint?: (result: CrawlExecutionResult, signal: AbortSignal) => Promise<void> | void;
  acquire?: (signal: AbortSignal, acquisitionDeadlineAt: number) => Promise<unknown>;
  onUpdate?: (result: { content: { type: "text"; text: string }[]; details: undefined }) => void;
}
export type CrawlExecutionResult = Awaited<ReturnType<typeof executeCrawlBatch>>;
export interface CrawlAcquisitionProgress {
  attemptedUrls: string[]; unattemptedUrls: string[]; complete: boolean;
  failure?: import("./http").CrawlFailureData;
}

/** One clock across sequential chunks; publish finalized sources before dispatching more. */
export async function executeCrawl(params: CrawlToolParams, config: Crawl4AIConfig, options: CrawlExecutionOptions) {
  const startedAt = Date.now();
  try { validateParams(params, config); }
  catch (error) { if (error instanceof CrawlOperationError || error instanceof CrawlValidationError) throw error; throw new CrawlValidationError(error instanceof Error ? error.message : "Invalid crawl parameters"); }
  const workMs = options.acquisitionTimeoutMs ?? Math.min(60000, config.timeout - Math.min(10000, config.timeout * 0.15));
  if (!Number.isFinite(workMs) || workMs <= 0 || workMs >= config.timeout) throw new CrawlValidationError("acquisitionTimeoutMs must be positive and less than config.timeout");
  if (options.deadlineAt !== undefined && !Number.isFinite(options.deadlineAt)) throw new CrawlValidationError("deadlineAt must be a finite absolute timestamp");
  const deadlineAt = Math.min(startedAt + config.timeout, options.deadlineAt ?? Infinity);
  if (deadlineAt <= startedAt) throw new CrawlOperationError("timeout", "Crawl deadline exhausted before dispatch");
  const acquisitionDeadlineAt = Math.min(startedAt + workMs, deadlineAt - Math.min(1000, config.timeout * 0.1));
  const operation = createCrawlDeadline(deadlineAt - startedAt, options.signal);
  const chunks = !params.deepCrawl && !options.acquire && config.raw.capabilities?.acquisition && Array.isArray(params.urls)
    ? Array.from({ length: Math.ceil(params.urls.length / 3) }, (_, index) => params.urls.slice(index * 3, index * 3 + 3)) : [params.urls];
  const outputs: CrawlExecutionResult[] = [];
  const attemptedUrls: string[] = [];
  let failure: import("./http").CrawlFailureData | undefined;
  try {
    for (const urls of chunks) {
      if (operation.signal.aborted) throw operation.signal.reason;
      if (Date.now() >= acquisitionDeadlineAt) { failure = { code: "timeout", category: "timeout", retryable: false }; break; }
      attemptedUrls.push(...urls);
      let output: CrawlExecutionResult;
      try {
        output = await executeCrawlBatch({ ...params, urls }, config, { ...options, signal: operation.signal, deadlineAt, acquisitionDeadlineAt });
      } catch (error) {
        if (operation.signal.aborted || options.signal?.aborted || !outputs.length) throw error;
        if (!(error instanceof CrawlOperationError)) throw error;
        failure = { code: error.code, category: error.category, retryable: error.retryable, serverCode: error.serverCode, phase: error.phase, operationOutcome: error.operationOutcome };
        break;
      }
      outputs.push(output);
      if (operation.signal.aborted) throw operation.signal.reason;
      // Cancellation remains authoritative: callbacks receive the same signal via
      // the owning host and must check it immediately before durable writes.
      if (options.onCheckpoint) await abortable(Promise.resolve(options.onCheckpoint(output, operation.signal)), operation.signal);
      if (operation.signal.aborted) throw operation.signal.reason;
    }
    if (!outputs.length) throw new CrawlOperationError("timeout", "Acquisition budget exhausted before dispatch");
    const unattemptedUrls = params.urls.slice(attemptedUrls.length);
    const acquisition: CrawlAcquisitionProgress = { attemptedUrls, unattemptedUrls, complete: !failure && !unattemptedUrls.length, failure };
    const first = outputs[0];
    const joinedText = outputs.map(output => output.content[0].text).join("\n\n") + (failure ? "\nPartial acquisition: remaining work did not complete; accepted saved sources remain available." : "");
    const aggregateOutput = capToolTextDetailed(joinedText);
    let position = 0;
    const deliveredChunks = outputs.map(output => {
      const delivered = position + output.content[0].text.length <= aggregateOutput.sourceChars;
      position += output.content[0].text.length + 2;
      return delivered;
    });
    const aggregatePages = outputs.flatMap((output, index) => output.details.evidence.pages.map(page => deliveredChunks[index] ? page : {
      ...page, delivery: { ranges: [], omitted: true, nextCall: page.delivery?.nextCall ? { ...page.delivery.nextCall, charOffset: 0 } : null },
    }));
    return jsonProjection({
      ...first,
      content: [{ type: "text" as const, text: aggregateOutput.text }],
      details: { ...first.details,
        evidence: { version: 1 as const, pages: aggregatePages },
        results: outputs.flatMap(output => output.details.results),
        savedFiles: outputs.flatMap(output => output.details.savedFiles ?? []),
        manifestPaths: outputs.flatMap(output => output.details.manifestPath ? [output.details.manifestPath] : []),
        partial: !!failure || !!unattemptedUrls.length || outputs.some(output => output.details.partial), acquisition,
        totalOriginalChars: outputs.reduce((sum, output) => sum + output.details.totalOriginalChars, 0),
        totalReturnedChars: outputs.reduce((sum, output, index) => sum + (deliveredChunks[index] ? output.details.totalReturnedChars : 0), 0),
        truncated: aggregateOutput.text !== joinedText || outputs.some(output => output.details.truncated),
      },
    });
  } finally { operation.dispose(); }
}

async function executeCrawlBatch(params: CrawlToolParams, config: Crawl4AIConfig, options: CrawlExecutionOptions & { acquisitionDeadlineAt: number }) {
      try { validateParams(params, config); }
      catch (error) { if (error instanceof CrawlOperationError) throw error; throw new CrawlValidationError(error instanceof Error ? error.message : "Invalid crawl parameters"); }
      const operation = createCrawlDeadline(Math.max(1, Math.min(config.timeout, (options.deadlineAt ?? Infinity) - Date.now())), options.signal);
      const budget = resolvePreviewSettings(params);
      const format = params.format ?? "markdown";
      const effectiveRequest = effectiveCrawlRequest(params, format, budget.preferFitMarkdown);
      const cwd = options.cwd;
      const selectedDir = resolveOutputDir(params.save, config.raw.outputDir);
      const outputDir = selectedDir ? resolve(cwd, selectedDir) : undefined;
      const artifacts: NonNullable<SaveCrawlOptions["artifacts"]> = [];
      let sessionDir: string | undefined;
      let recoveryHtmlPath: string | undefined;
      try {
        if (operation.signal.aborted) throw operation.signal.reason;
        options.onUpdate?.({ content: [{ type: "text", text: "Waiting for crawl service…" }], details: undefined });
        const queue = createCrawlDeadline(Math.max(1, options.acquisitionDeadlineAt - Date.now()), operation.signal);
        let pacing: Awaited<ReturnType<typeof applyRequestPacing>>;
        try { pacing = await applyRequestPacing(config, queue.signal); }
        finally { queue.dispose(); }
        const crawlerParams: Record<string, unknown> = {
          cache_mode: { type: "CacheMode", params: params.bypassCache ? "bypass" : "enabled" },
        };
        if (params.waitFor !== undefined) crawlerParams.delay_before_return_html = params.waitFor / 1000;

        if (params.deepCrawl) crawlerParams.deep_crawl_strategy = buildDeepCrawlStrategy(params.deepCrawl, DEFAULT_DEEP_MAX_PAGES);
        const unsupportedPdfUrls = !config.raw.capabilities?.acquisition && !options.acquire ? params.urls.filter(url => /\.pdf$/i.test(new URL(url).pathname)) : [];
        const supportedUrls = params.urls.filter(url => !unsupportedPdfUrls.includes(url));
        if (!supportedUrls.length) throw new CrawlOperationError("unsupported_capability", "unsupported_document: PDF extraction requires the document capability on the configured crawl service");
        const acquire = options.acquire ?? (config.raw.capabilities?.acquisition && !params.deepCrawl ? (signal: AbortSignal) => acquirePages(params, config, signal, options.acquisitionDeadlineAt) : undefined);
        const raw = acquire ? undefined : await fetchCrawlApi(config, "/crawl", {
          method: "POST",
          body: JSON.stringify({ urls: supportedUrls, crawler_config: { type: "CrawlerRunConfig", params: crawlerParams } }),
        }, operation.signal);
        let data: unknown;
        if (acquire) data = await acquire(operation.signal, options.acquisitionDeadlineAt);
        else try { data = JSON.parse(raw!); } catch { throw new CrawlOperationError("provider_failure", "Malformed crawl4ai JSON response"); }
        validateCrawlResponse(data);
        for (const url of unsupportedPdfUrls) data.results.push({ url, success: false, error_message: "unsupported_document: PDF extraction requires the document capability on the configured crawl service" });
        if (data.results.every(result => !result.success)) throw new CrawlOperationError(data.results.every(result => result.status_code === 403 || result.status_code === 429) ? "website_blocked" : "provider_failure", `All pages failed: ${data.results.map(result => `${result.url}: ${result.error_message ?? "Unknown error"}`).join("; ")}`);
        // Redact server-provided diagnostics before either rendering or persistence.
        for (const result of data.results) {
          if (result.error_message) result.error_message = redactError(result.error_message, config);
          if (result.error) result.error.message = redactError(result.error.message, config);
        }
        let partial = data.results.some(result => !result.success);
        options.onUpdate?.({ content: [{ type: "text", text: "Saving complete crawl content…" }], details: undefined });
        for (const [index, result] of data.results.entries()) {
          const artifact: NonNullable<SaveCrawlOptions["artifacts"]>[number] = {};
          artifacts.push(artifact);
          if (!result.success) continue;
          const originalMarkdown = formatContentForSave(result, "markdown", { preferFitMarkdown: false });
          artifact.originalMarkdownContent = originalMarkdown;
          if (outputDir && result.html !== undefined) {
            sessionDir ??= createCrawlSession(outputDir, params.urls);
            artifact.rawHtmlFile = `${index}-${urlToFilePath(result.url, "html")}.raw.html`;
            recoveryHtmlPath = writeCrawlArtifact(sessionDir, artifact.rawHtmlFile, result.html);
          }
          if (result.extraction_error) {
            result.success = false;
            result.error_message = `${result.extraction_error.code}: ${redactError(result.extraction_error.message, config)}`;
            result.error = { ...result.extraction_error, retryable: false };
            continue;
          }
          const contentType = Object.entries(result.response_headers ?? {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
          if (!result.document && (/\.pdf$/i.test(new URL(result.url).pathname) || /application\/pdf/i.test(contentType))) {
            result.success = false; result.error_message = "unsupported_document: PDF extraction requires the document capability on the configured crawl service";
          } else if (format === "text") {
            result.markdown = result.html !== undefined && (!contentType || /html/i.test(contentType)) ? htmlToText(result.selected_html ?? result.html, params.includeLinks) : originalMarkdown || result.html || "";
          }
          if (params.includeLinks && format === "markdown" && result.links) {
            const body = formatContentForSave(result, format, { preferFitMarkdown: budget.preferFitMarkdown });
            const links = [...result.links.internal, ...result.links.external].filter(link => !body.includes(link.href));
            result.markdown = body + (links.length ? "\n\n" + links.map(link => `[${link.text}](${link.href})`).join("\n") : "");
          }
          if (params.bm25Query) {
            const source = formatContentForSave(result, format, { preferFitMarkdown: budget.preferFitMarkdown });
            const filtered = filterMarkdownBm25(source, params.bm25Query, params.bm25Threshold ?? 1);
            artifact.sourceContent = source;
            artifact.filter = { query: filtered.query, threshold: filtered.threshold, matchedSectionCount: filtered.matchedSectionCount, totalSections: filtered.totalSections };
            result.markdown = filtered.content;
          }
        }
        for (const [index, result] of data.results.entries()) {
          const body = formatContentForSave(result, format, { preferFitMarkdown: budget.preferFitMarkdown });
          result.evidence = pageEvidence(result, body);
          result.evidence.views.push(evidenceView("requested", body, !!params.bm25Query || !!params.selector || !!params.excludeSelector || budget.preferFitMarkdown));
          if (result.html !== undefined) result.evidence.views.push(evidenceView("original_html", result.html));
          if (artifacts[index]?.originalMarkdownContent !== undefined) result.evidence.views.push(evidenceView("original_markdown", artifacts[index].originalMarkdownContent!));
          if (outputDir && (result.interaction || result.document || result.selected_html !== undefined || result.extracted_content !== undefined)) sessionDir ??= createCrawlSession(outputDir, params.urls);
          persistCapabilityViews(result, sessionDir);
          const requested = result.evidence.views[0];
          result.evidence.resources = { links: (result.links?.internal.length ?? 0) + (result.links?.external.length ?? 0),
            images: Array.isArray(result.media?.images) ? result.media.images.length : null, tables: result.tables?.length ?? null,
            sourceViewId: result.evidence.views.find(view => view.kind === "original_html")?.id ?? requested.id };
        }
        if (operation.signal.aborted) throw operation.signal.reason;
        const pages = toFormattedPages(data.results, format, budget);
        const decision = decideReturnMode({ requestedMode: budget.returnMode, saveRequested: params.save });
        const saved = outputDir ? saveCrawlResultsDetailed(outputDir, params.urls, data.results, format, params.deepCrawl ? { maxDepth: params.deepCrawl.maxDepth, maxPages: params.deepCrawl.maxPages ?? DEFAULT_DEEP_MAX_PAGES } : undefined, { deferManifest: true, preferFitMarkdown: budget.preferFitMarkdown, retention: config.raw.retention, sessionDir, artifacts, request: effectiveRequest, service: { baseUrl: credentialFreeBaseUrl(config.baseUrl) } }) : undefined;
        const savedFiles = saved?.pagePaths.map(page => ({ ...page, relativePath: page.file }));
        partial = data.results.some(result => !result.success || result.evidence?.usability === "unusable");
        const warnings = pages.filter((page, index) => page.usability === "unusable" && !artifacts[index]?.filter).map(page => `${page.url}: ${(page.usabilityReasons ?? []).join(", ")}`);
        const bm25 = artifacts[0]?.filter;
        const filterSummary = bm25 ? `\nBM25 query=${JSON.stringify(bm25.query)}, matched ${bm25.matchedSectionCount}/${bm25.totalSections} sections, threshold=${bm25.threshold}${bm25.matchedSectionCount === 0 ? " (valid empty selection)" : ""}` : "";
        const built = buildBudgetedToolText({ pages, budget, decision, isDeepCrawl: !!params.deepCrawl, maxDepth: params.deepCrawl?.maxDepth, savedPath: saved?.sessionDir, manifestPath: saved?.manifestPath, savedFiles, executionSummary: `*Execution:* egress=server-managed${partial ? " — Partial results (some acquisitions failed or content is unusable)" : ""}${warnings.length ? `\nWarning: ${warnings.join("; ")}` : ""}${filterSummary}` });
        const capabilityIndex = data.results.flatMap(result => result.evidence!.views
          .filter(view => ["selected_html", "structured", "before_interaction_html", "interaction_result", "original_document", "document_pages"].includes(view.kind))
          .map(view => `${view.kind}${view.callerScriptInfluenced ? " [caller-script-influenced]" : ""}: ${view.path ?? "not saved"}`)).join("\n");
        const unsavedOperationPreview = !saved ? data.results.map(result => JSON.stringify({ extracted: result.extracted_content, interactionResults: result.interaction?.results, document: result.document ? { pages: result.document.pages, metadata: result.document.metadata, limitations: result.document.limitations } : undefined })).filter(text => text !== "{}").join("\n").slice(0, 1200) : "";
        const finalOutput = capToolTextDetailed([built.text, capabilityIndex, unsavedOperationPreview ? `Operation data preview (at most 1200 characters; save to retain complete data):\n${unsavedOperationPreview}` : ""].filter(Boolean).join("\n\n"), saved?.manifestPath);
        for (const [index, result] of data.results.entries()) {
          const page = built.pages[index];
          const source = pages[index].content;
          const end = built.mode === "files" ? 0 : Math.max(0, Math.min(page.visibleBodyChars ?? 0, finalOutput.sourceChars - (page.renderedStart ?? 0)));
          page.returnedChars = end;
          page.truncated = end < source.length;
          const view = result.evidence!.views.find(view => view.kind === "requested")!;
          const path = savedFiles?.[index]?.path;
          result.evidence!.delivery = { ranges: end ? [{ start: 0, end, unit: "utf16" }] : [], omitted: end < source.length,
            nextCall: path && end < source.length ? { path, mode: "chunks", charOffset: end, revision: view.sha256, viewId: `artifact:${view.sha256}` } : null };
          result.evidence!.resources = { links: (result.links?.internal.length ?? 0) + (result.links?.external.length ?? 0),
            images: Array.isArray(result.media?.images) ? result.media.images.length : null, tables: result.tables?.length ?? null,
            sourceViewId: result.evidence!.views.find(view => view.kind === "original_html")?.id ?? view.id };
        }
        for (const result of data.results) result.evidence = jsonProjection(result.evidence!);
        if (saved) finalizeCrawlEvidence(saved.sessionDir, data.results);
        return jsonProjection({
          content: [{ type: "text" as const, text: finalOutput.text }],
          details: {
            evidence: { version: 1 as const, pages: data.results.map(result => result.evidence!) }, results: slimResultDetails(built.pages, data.results, savedFiles), format, egress: "server-managed", execution: { egress: "server-managed" }, partial, warnings, bm25,
            minRequestIntervalMs: pacing?.minRequestIntervalMs, rateLimitWaitedMs: pacing?.waitedMs,
            savedPath: saved?.sessionDir, manifestPath: saved?.manifestPath, savedFiles,
            returnMode: built.mode, returnModeReason: decision.reason, truncated: built.pages.some(page => page.truncated) || built.truncated,
            totalOriginalChars: built.totalOriginalChars, totalReturnedChars: built.pages.reduce((sum, page) => sum + (built.mode === "files" ? 0 : page.returnedChars), 0), preview: budget, cleanup: saved?.cleanup,
            ...(params.deepCrawl ? { deepCrawl: { totalPages: data.results.length, maxDepth: params.deepCrawl.maxDepth, maxPages: params.deepCrawl.maxPages ?? DEFAULT_DEEP_MAX_PAGES } } : {}),
          },
        });
      } catch (error) {
        if (error && typeof error === "object" && "operationOutcome" in error && error.operationOutcome === "unconfirmed") {
          if (error instanceof Error) error.message = redactError(error.message, config);
          throw error;
        }
        throw new CrawlOperationError(error instanceof CrawlOperationError ? error.code : operation.signal.aborted ? "transport_failure" : "provider_failure", `Crawl failed: ${redactError(error instanceof Error ? error.message : String(error), config)}${recoveryHtmlPath ? `. Original HTML: ${recoveryHtmlPath}` : ""}`, error instanceof CrawlOperationError ? error.status : undefined,
          error instanceof CrawlOperationError ? { serverCode: error.serverCode, phase: error.phase, retryable: error.retryable, operationOutcome: error.operationOutcome } : {});
      } finally { operation.dispose(); }

}
