/**
 * Crawl tool implementation for pi-crawl4ai.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import type {
  CrawlToolParams,
  CrawlResult,
  Crawl4AIResponse,
  DeepCrawlConfig,
  ReturnMode,
} from "./types";
import { applyRequestPacing } from "./requestPacing";
import {
  resolveOutputDir,
  saveCrawlResultsDetailed,
  type SavedCrawlPage,
} from "./saveOutput";
import { formatCleanupSummary } from "./cleanup";
import {
  DEFAULT_TOKEN_BUDGET,
  buildBudgetedToolText,
  decideReturnMode,
  slimResultDetails,
  toFormattedPages,
  type TokenBudgetConfig,
} from "./tokenBudget";

/**
 * Build a crawl4ai-compatible deep crawl strategy object.
 * Uses the {type, params} serialization format expected by crawl4ai API.
 */
function buildDeepCrawlStrategy(config: DeepCrawlConfig, defaultMaxPages: number): Record<string, unknown> {
  const strategyMap: Record<string, string> = {
    bfs: "BFSDeepCrawlStrategy",
    dfs: "DFSDeepCrawlStrategy",
    "best-first": "BestFirstCrawlingStrategy",
  };

  const strategyName = strategyMap[config.strategy || "bfs"];

  // Build filter chain if filters are specified
  const filters: Record<string, unknown>[] = [];

  if (config.includePatterns || config.excludePatterns) {
    const patterns = [
      ...(config.includePatterns || []),
      ...(config.excludePatterns?.map((p) => `!${p}`) || []),
    ];
    if (patterns.length > 0) {
      filters.push({
        type: "URLPatternFilter",
        params: {
          patterns,
          use_glob: true,
        },
      });
    }
  }

  if (config.allowedDomains && config.allowedDomains.length > 0) {
    filters.push({
      type: "DomainFilter",
      params: {
        allowed_domains: config.allowedDomains,
      },
    });
  }

  const filterChain =
    filters.length > 0
      ? { type: "FilterChain", params: { filters } }
      : undefined;

  const params: Record<string, unknown> = {
    max_depth: config.maxDepth,
    max_pages: config.maxPages ?? defaultMaxPages,
    include_external: config.includeExternal ?? false,
  };

  if (filterChain) {
    params.filter_chain = filterChain;
  }

  if (config.scoreThreshold !== undefined) {
    params.score_threshold = config.scoreThreshold;
  }

  return {
    type: strategyName,
    params,
  };
}

function formatExecutionSummary(): string {
  return "*Execution:* egress=server-managed";
}

function resolveTokenBudget(
  config: Crawl4AIConfig,
  params: Pick<
    CrawlToolParams,
    "returnMode" | "maxCharsPerPage" | "maxCharsPerCall" | "preferFitMarkdown"
  >
): TokenBudgetConfig {
  const defaults = config.raw.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  return {
    maxCharsPerPage: params.maxCharsPerPage ?? defaults.maxCharsPerPage,
    maxCharsPerCall: params.maxCharsPerCall ?? defaults.maxCharsPerCall,
    returnMode: (params.returnMode ?? defaults.returnMode) as ReturnMode,
    preferFitMarkdown: params.preferFitMarkdown ?? defaults.preferFitMarkdown,
    deepCrawlDefaultMaxPages: defaults.deepCrawlDefaultMaxPages,
    excerptChars: defaults.excerptChars,
  };
}

/**
 * Register the crawl tool with pi.
 */
export function registerCrawlTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  const budgetDefaults = config.raw.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  pi.registerTool({
    name: "crawl",
    label: "Crawl Website",
    description:
      "Extract content from known URL(s) via crawl4ai browser rendering (JS/SPA). " +
      "Not for search/discovery. " +
      "Egress/proxy is managed by the crawl4ai server, not this tool. " +
      "Small pages return markdown inline; large/deep crawls auto-save and return a page index plus exact paths—then use crawl_read. " +
      "Use returnMode/maxChars* to override.",
    promptSnippet:
      "Crawl known URLs; large results auto-save with a manifest, page index, and exact page paths—then use crawl_read.",
    promptGuidelines: [
      "Prefer discovering URLs with a search tool first when available; crawl only the pages you need.",
      "For multi-page or deep crawls, read crawl-manifest.json first or use the exact page paths printed in the result with crawl_read; never invent flattened filenames.",
      "If save is omitted or false and inline output is truncated, it is not recoverable from disk; re-crawl with save=true for progressive reads.",
      "Use deepCrawl only when multi-page exploration is needed; start with low maxDepth/maxPages.",
      "Use returnMode=inline only when you truly need full bodies in-context for a small page set.",
    ],
    parameters: Type.Object({
      urls: Type.Array(Type.String(), {
        description: "URLs to crawl (one or more). For deep crawling, provide a single start URL.",
        minItems: 1,
      }),
      format: Type.Optional(
        Type.Union([Type.Literal("markdown"), Type.Literal("html"), Type.Literal("links")], {
          description: "Output format: markdown (default), html, or links",
        })
      ),
      waitFor: Type.Optional(
        Type.Number({
          description: "Milliseconds to wait before extracting content (for dynamic pages)",
        })
      ),
      jsCode: Type.Optional(
        Type.String({
          description: "JavaScript code to execute before extraction",
        })
      ),
      bypassCache: Type.Optional(
        Type.Boolean({
          description: "Bypass crawl4ai cache and force fresh crawl",
        })
      ),
      deepCrawl: Type.Optional(
        Type.Object(
          {
            strategy: Type.Optional(
              Type.Union(
                [Type.Literal("bfs"), Type.Literal("dfs"), Type.Literal("best-first")],
                {
                  description:
                    "Crawl strategy: bfs (default), dfs, or best-first",
                }
              )
            ),
            maxDepth: Type.Number({
              description: "Maximum crawl depth (1 = start page only)",
              minimum: 1,
            }),
            maxPages: Type.Optional(
              Type.Number({
                description: `Maximum total pages to crawl (default: ${budgetDefaults.deepCrawlDefaultMaxPages})`,
                minimum: 1,
              })
            ),
            includeExternal: Type.Optional(
              Type.Boolean({
                description: "Follow links to external domains (default: false)",
              })
            ),
            includePatterns: Type.Optional(
              Type.Array(Type.String(), {
                description: "URL glob patterns to include (e.g., '/docs/*')",
              })
            ),
            excludePatterns: Type.Optional(
              Type.Array(Type.String(), {
                description: "URL glob patterns to exclude (e.g., '/admin/*')",
              })
            ),
            allowedDomains: Type.Optional(
              Type.Array(Type.String(), {
                description: "Only follow links to these domains",
              })
            ),
            scoreThreshold: Type.Optional(
              Type.Number({
                description: "Minimum relevance score for best-first (0.0-1.0)",
                minimum: 0,
                maximum: 1,
              })
            ),
          },
          {
            description:
              "Deep crawl linked pages. Multi-page results default to files/index mode to save tokens.",
          }
        )
      ),
      save: Type.Optional(
        Type.Union([Type.Boolean(), Type.String()], {
          description:
            "Save results to disk. true = ./output-crawl4ai (or CRAWL4AI_OUTPUT_DIR), or a custom path. Auto mode may save when over budget even if omitted.",
        })
      ),
      returnMode: Type.Optional(
        Type.Union([Type.Literal("auto"), Type.Literal("inline"), Type.Literal("files")], {
          description:
            "auto (default): inline small results, files/index for large/deep crawls. inline: bodies in tool result (budgeted). files: index only + disk.",
        })
      ),
      maxCharsPerPage: Type.Optional(
        Type.Number({
          description: `Max body chars per page in the tool result (default: ${budgetDefaults.maxCharsPerPage})`,
          minimum: 500,
        })
      ),
      maxCharsPerCall: Type.Optional(
        Type.Number({
          description: `Max total body chars for this call (default: ${budgetDefaults.maxCharsPerCall})`,
          minimum: 1000,
        })
      ),
      preferFitMarkdown: Type.Optional(
        Type.Boolean({
          description:
            "Prefer crawl4ai fit_markdown (main content) over raw_markdown when available (default: true)",
        })
      ),
    }),

    async execute(
      _toolCallId: string,
      params: CrawlToolParams,
      signal?: AbortSignal,
      _onUpdate?: unknown,
      _ctx?: unknown
    ) {
      const {
        urls,
        format = "markdown",
        waitFor,
        jsCode,
        bypassCache,
        deepCrawl,
        save,
        returnMode,
        maxCharsPerPage,
        maxCharsPerCall,
        preferFitMarkdown,
      } = params as CrawlToolParams;

      // Validate deep crawl requires single URL
      if (deepCrawl && urls.length !== 1) {
        throw new Error(
          "Deep crawling requires exactly one start URL. Use regular crawl for multiple URLs."
        );
      }

      const tokenBudget = resolveTokenBudget(config, {
        returnMode,
        maxCharsPerPage,
        maxCharsPerCall,
        preferFitMarkdown,
      });

      const executionSummary = formatExecutionSummary();
      const crawlerConfig: Record<string, unknown> = {};

      if (waitFor) {
        crawlerConfig.page_timeout = waitFor + 30000; // Page timeout = wait + buffer
        crawlerConfig.wait_for = `js:() => { return new Promise(resolve => setTimeout(resolve, ${waitFor})); }`;
      }

      if (jsCode) {
        crawlerConfig.js_code = [jsCode];
      }

      if (bypassCache) {
        crawlerConfig.cache_mode = "BYPASS";
      }

      // Add deep crawl strategy if configured
      if (deepCrawl) {
        crawlerConfig.deep_crawl_strategy = buildDeepCrawlStrategy(
          deepCrawl,
          tokenBudget.deepCrawlDefaultMaxPages
        );
      }

      // Note: markdown is the default output format in crawl4ai.
      // We don't need to set markdown_generator - the default behavior
      // already generates markdown. Setting it to `true` causes a bug
      // where crawl4ai receives a boolean instead of a MarkdownGenerationStrategy.

      const payload = {
        urls,
        crawler_config: crawlerConfig,
      };

      // Check for cancellation
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Crawl cancelled" }],
          details: { cancelled: true },
        };
      }

      try {
        const requestPacing = await applyRequestPacing(config, signal);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const apiToken = config.apiToken ?? config.raw.apiToken;
        if (apiToken) {
          headers.Authorization = `Bearer ${apiToken}`;
        }

        const response = await fetch(`${config.baseUrl}/crawl`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`crawl4ai API error (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as Crawl4AIResponse;

        if (!data.success) {
          throw new Error("Crawl request failed");
        }

        const pages = toFormattedPages(data.results, format, tokenBudget);
        const isDeepCrawl = Boolean(deepCrawl);
        const decision = decideReturnMode({
          requestedMode: tokenBudget.returnMode,
          pages,
          isDeepCrawl,
          urlCount: urls.length,
          maxCharsPerCall: tokenBudget.maxCharsPerCall,
          saveRequested: save,
        });

        // Resolve save path: explicit save wins; auto-save when over budget / files mode
        const configuredOutputDir = config.raw.outputDir;
        let outputDir = resolveOutputDir(save, configuredOutputDir);
        if (!outputDir && decision.autoSave && save !== false) {
          // Auto-save oversized/files-mode results so content is recoverable via read
          outputDir = resolveOutputDir(true, configuredOutputDir);
        }

        let savedPath: string | undefined;
        let manifestPath: string | undefined;
        let savedPagePaths: SavedCrawlPage[] | undefined;
        let cleanupSummary: string | undefined;
        let cleanupDetails: ReturnType<typeof saveCrawlResultsDetailed>["cleanup"];
        if (outputDir) {
          const saved = saveCrawlResultsDetailed(
            outputDir,
            urls,
            data.results,
            format,
            deepCrawl
              ? {
                  maxDepth: deepCrawl.maxDepth,
                  maxPages: deepCrawl.maxPages ?? tokenBudget.deepCrawlDefaultMaxPages,
                }
              : undefined,
            {
              preferFitMarkdown: tokenBudget.preferFitMarkdown,
              retention: config.raw.retention,
            }
          );
          savedPath = saved.sessionDir;
          manifestPath = saved.manifestPath;
          savedPagePaths = saved.pagePaths;
          cleanupDetails = saved.cleanup;
          if (saved.cleanup && saved.cleanup.deleted.length > 0) {
            cleanupSummary = formatCleanupSummary(saved.cleanup);
          }
        }

        const built = buildBudgetedToolText({
          pages,
          rawResults: data.results,
          budget: tokenBudget,
          decision,
          isDeepCrawl,
          maxDepth: deepCrawl?.maxDepth,
          savedPath,
          manifestPath,
          savedFiles: savedPagePaths?.map((page) => ({
            url: page.url,
            relativePath: page.file,
            path: page.path,
            outlinePath: page.outlinePath,
            metaPath: page.metaPath,
          })),
          executionSummary,
        });

        const slimResults = slimResultDetails(
          built.pages,
          data.results,
          built.savedFiles
        );
        const text = cleanupSummary
          ? `${built.text}

*Retention:* ${cleanupSummary.split("\n")[0]}`
          : built.text;

        return {
          content: [{ type: "text", text }],
          details: {
            results: slimResults,
            format,
            egress: "server-managed",
            execution: { egress: "server-managed" },
            minRequestIntervalMs: requestPacing?.minRequestIntervalMs,
            rateLimitWaitedMs: requestPacing?.waitedMs,
            savedPath,
            manifestPath: built.manifestPath,
            savedFiles: built.savedFiles,
            returnMode: built.mode,
            returnModeReason: decision.reason,
            truncated: built.truncated,
            totalOriginalChars: built.totalOriginalChars,
            totalReturnedChars: built.totalReturnedChars,
            tokenBudget: {
              maxCharsPerPage: tokenBudget.maxCharsPerPage,
              maxCharsPerCall: tokenBudget.maxCharsPerCall,
              preferFitMarkdown: tokenBudget.preferFitMarkdown,
              requestedReturnMode: tokenBudget.returnMode,
            },
            cleanup: cleanupDetails
              ? {
                  deleted: cleanupDetails.deleted,
                  kept: cleanupDetails.kept,
                  scanned: cleanupDetails.scanned,
                  freedBytes: cleanupDetails.freedBytes,
                }
              : undefined,
            ...(deepCrawl
              ? {
                  deepCrawl: {
                    totalPages: data.results.length,
                    maxDepth: deepCrawl.maxDepth,
                    maxPages: deepCrawl.maxPages ?? tokenBudget.deepCrawlDefaultMaxPages,
                  },
                }
              : {}),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Crawl failed: ${message}`);
      }
    },
  } as any);
}
