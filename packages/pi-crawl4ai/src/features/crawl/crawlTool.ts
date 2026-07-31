/**
 * Crawl tool implementation for pi-crawl4ai.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { buildBrowserConfig, resolveAuthSelection } from "../../config";
import type {
  CrawlToolParams,
  CrawlResult,
  Crawl4AIResponse,
  DeepCrawlConfig,
  ReturnMode,
} from "./types";
import { applyRequestPacing } from "./requestPacing";
import { resolveOutputDir, saveCrawlResultsDetailed } from "./saveOutput";
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

function buildExecutionDetails(
  config: Crawl4AIConfig,
  site: string | undefined,
  authSelection: ReturnType<typeof resolveAuthSelection>
): {
  siteHint?: string;
  authProfile?: string;
  authProfileReason: string;
  proxyUsed: boolean;
  proxySource: "auth-profile" | "default" | "none";
  hasCookies: boolean;
  hasHeaders: boolean;
  hasUserAgent: boolean;
} {
  const profile = authSelection?.profile;
  const proxySource = profile?.proxy
    ? "auth-profile"
    : config.proxyEnabled
      ? "default"
      : "none";

  return {
    siteHint: site,
    authProfile: authSelection?.profileName,
    authProfileReason: authSelection?.reason ?? "none",
    proxyUsed: proxySource !== "none",
    proxySource,
    hasCookies: Boolean(profile?.cookies?.length),
    hasHeaders: Boolean(profile?.headers && Object.keys(profile.headers).length > 0),
    hasUserAgent: Boolean(profile?.userAgent),
  };
}

function formatExecutionSummary(details: ReturnType<typeof buildExecutionDetails>): string {
  return [
    "*Execution:*",
    `siteHint=${details.siteHint ?? "none"}`,
    `auth=${details.authProfile ?? "none"}`,
    `authReason=${details.authProfileReason}`,
    `proxy=${details.proxySource}`,
    `cookies=${details.hasCookies ? "yes" : "no"}`,
    `headers=${details.hasHeaders ? "yes" : "no"}`,
    `userAgent=${details.hasUserAgent ? "yes" : "no"}`,
  ].join(" ");
}

function prepareCrawlArguments(args: unknown): unknown {
  if (!args || typeof args !== "object") {
    return args;
  }

  const input = args as Record<string, unknown>;
  const next: Record<string, unknown> = { ...input };

  if (next.site === undefined) {
    const siteAlias = next.platform ?? next.siteName ?? next.sourceSite;
    if (typeof siteAlias === "string") {
      next.site = siteAlias;
    }
  }

  if (next.authProfile === undefined) {
    const authAlias = next.profile ?? next.auth_profile ?? next.auth;
    if (typeof authAlias === "string") {
      next.authProfile = authAlias;
    }
  }

  return next;
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
      "Crawl one or more URLs with crawl4ai (browser render, optional proxy/auth). " +
      "Defaults keep large bodies off the model: prefer fit markdown, char budgets, and files/index mode for deep or large crawls. " +
      "Use returnMode/maxChars* to override; pair with brave_search for discovery.",
    promptSnippet:
      "Crawl pages with auth/deep-crawl support; large results auto-save and return an index to save tokens.",
    promptGuidelines: [
      "Prefer discovering URLs with search first; crawl only the pages you need.",
      "If the user provides URLs directly, rely on automatic domain-based auth profile selection by default. Do not pass authProfile unless the user explicitly asks for a specific account, login context, or named auth setup.",
      "Use the site parameter only when the user refers to a platform or site by name instead of giving a domain, for example 'from X', 'from Reddit', or similar site-name phrasing.",
      "Do not invent authProfile values. Only pass authProfile when the user explicitly requests a known profile or prior context established one.",
      "For multi-page or deep crawls, expect a page index + disk paths; use read on specific saved files instead of re-inlining everything.",
      "Use returnMode=inline only when you truly need full bodies in-context for a small page set.",
    ],
    prepareArguments: prepareCrawlArguments,
    parameters: Type.Object({
      urls: Type.Array(Type.String(), {
        description: "URLs to crawl (one or more). For deep crawling, provide a single start URL.",
        minItems: 1,
      }),
      site: Type.Optional(
        Type.String({
          description: "Optional site hint for auth profile selection, e.g. x, twitter, reddit",
        })
      ),
      authProfile: Type.Optional(
        Type.String({
          description:
            "Optional explicit auth profile name from config. Overrides automatic site/domain matching.",
        })
      ),
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
        site,
        authProfile,
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

      const authSelection = resolveAuthSelection(config, { urls, site, authProfile });
      const executionDetails = buildExecutionDetails(config, site, authSelection);
      const executionSummary = formatExecutionSummary(executionDetails);

      // Build the request payload
      const browserConfig = buildBrowserConfig(config, authSelection, urls);

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
        browser_config: browserConfig,
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
        const requestPacing = await applyRequestPacing(config, authSelection, signal);

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
        let cleanupSummary: string | undefined;
        let cleanupDetails: ReturnType<typeof saveCrawlResultsDetailed>["cleanup"];
        if (outputDir) {
          const saved = saveCrawlResultsDetailed(
            outputDir,
            urls,
            data.results,
            format,
            config.proxyEnabled,
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
          executionSummary,
        });

        const slimResults = slimResultDetails(built.pages, data.results);
        const text = cleanupSummary
          ? `${built.text}

*Retention:* ${cleanupSummary.split("\n")[0]}`
          : built.text;

        return {
          content: [{ type: "text", text }],
          details: {
            results: slimResults,
            proxyUsed: executionDetails.proxyUsed,
            proxySource: executionDetails.proxySource,
            hasCookies: executionDetails.hasCookies,
            hasHeaders: executionDetails.hasHeaders,
            hasUserAgent: executionDetails.hasUserAgent,
            siteHint: executionDetails.siteHint,
            format,
            authProfile: executionDetails.authProfile,
            authProfileReason: executionDetails.authProfileReason,
            execution: executionDetails,
            minRequestIntervalMs: requestPacing?.minRequestIntervalMs,
            rateLimitWaitedMs: requestPacing?.waitedMs,
            savedPath,
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
