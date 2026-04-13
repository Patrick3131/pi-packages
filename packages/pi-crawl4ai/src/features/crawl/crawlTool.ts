/**
 * Crawl tool implementation for pi-crawl4ai.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { buildBrowserConfig, resolveAuthSelection } from "../../config";
import type { CrawlToolParams, CrawlResult, Crawl4AIResponse, MarkdownGenerationResult, DeepCrawlConfig } from "./types";
import { resolveOutputDir, saveCrawlResults } from "./saveOutput";

/**
 * Build a crawl4ai-compatible deep crawl strategy object.
 * Uses the {type, params} serialization format expected by crawl4ai API.
 */
function buildDeepCrawlStrategy(config: DeepCrawlConfig): Record<string, unknown> {
  const strategyMap: Record<string, string> = {
    "bfs": "BFSDeepCrawlStrategy",
    "dfs": "DFSDeepCrawlStrategy",
    "best-first": "BestFirstCrawlingStrategy",
  };

  const strategyName = strategyMap[config.strategy || "bfs"];

  // Build filter chain if filters are specified
  const filters: Record<string, unknown>[] = [];

  if (config.includePatterns || config.excludePatterns) {
    const patterns = [
      ...(config.includePatterns || []),
      ...(config.excludePatterns?.map(p => `!${p}`) || []),
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

  const filterChain = filters.length > 0
    ? { type: "FilterChain", params: { filters } }
    : undefined;

  const params: Record<string, unknown> = {
    max_depth: config.maxDepth,
    max_pages: config.maxPages ?? 100,
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

/**
 * Register the crawl tool with pi.
 */
export function registerCrawlTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool({
    name: "crawl",
    label: "Crawl Website",
    description:
      "Crawl one or more URLs using crawl4ai with browser rendering and optional proxy support. " +
      "Returns markdown, HTML, or extracted links. Use this for scraping JavaScript-rendered pages, " +
      "SPAs, or when you need structured content extraction. " +
      "Use deepCrawl to follow links and crawl multiple pages from a starting URL.",
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
          description: "Optional explicit auth profile name from config. Overrides automatic site/domain matching.",
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
        Type.Object({
          strategy: Type.Optional(
            Type.Union(
              [Type.Literal("bfs"), Type.Literal("dfs"), Type.Literal("best-first")],
              { description: "Crawl strategy: bfs (breadth-first, default), dfs (depth-first), best-first (score-based)" }
            )
          ),
          maxDepth: Type.Number({
            description: "Maximum crawl depth (1 = start page only, 2 = start + linked pages, etc.)",
            minimum: 1,
          }),
          maxPages: Type.Optional(
            Type.Number({
              description: "Maximum total pages to crawl (default: 100)",
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
              description: "URL glob patterns to include (e.g., '/docs/*', '*.html')",
            })
          ),
          excludePatterns: Type.Optional(
            Type.Array(Type.String(), {
              description: "URL glob patterns to exclude (e.g., '/admin/*', '*.pdf')",
            })
          ),
          allowedDomains: Type.Optional(
            Type.Array(Type.String(), {
              description: "Only follow links to these domains",
            })
          ),
          scoreThreshold: Type.Optional(
            Type.Number({
              description: "Minimum relevance score for best-first strategy (0.0-1.0)",
              minimum: 0,
              maximum: 1,
            })
          ),
        }, {
          description: "Deep crawl configuration. Enables crawling linked pages up to maxDepth.",
        })
      ),
      save: Type.Optional(
        Type.Union([Type.Boolean(), Type.String()], {
          description: "Save results to disk. true = save to ./output-crawl4ai, or provide a custom directory path.",
        })
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { urls, site, authProfile, format = "markdown", waitFor, jsCode, bypassCache, deepCrawl, save } = params as CrawlToolParams;

      // Validate deep crawl requires single URL
      if (deepCrawl && urls.length !== 1) {
        throw new Error("Deep crawling requires exactly one start URL. Use regular crawl for multiple URLs.");
      }

      const authSelection = resolveAuthSelection(config, { urls, site, authProfile });

      // Build the request payload
      const browserConfig = buildBrowserConfig(config, authSelection);

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
        crawlerConfig.deep_crawl_strategy = buildDeepCrawlStrategy(deepCrawl);
      }

      // Note: markdown is the default output format in crawl4ai.
      // We don't need to set markdown_generator - the default behavior
      // already generates markdown. Setting it to `true` causes a bug
      // where crawl4ai receives a boolean instead of a MarkdownGenerationStrategy.
      // See: https://github.com/unclecode/crawl4ai/issues (bool object has no attribute 'generate_markdown')

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
        const response = await fetch(`${config.baseUrl}/crawl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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

        // Format results based on requested format
        const formattedResults = data.results.map((result) => formatResult(result, format));

        // Save to disk if requested
        const outputDir = resolveOutputDir(save);
        let savedPath: string | undefined;
        if (outputDir) {
          savedPath = saveCrawlResults(
            outputDir,
            urls,
            data.results,
            format,
            config.proxyEnabled,
            deepCrawl ? { maxDepth: deepCrawl.maxDepth, maxPages: deepCrawl.maxPages } : undefined
          );
        }

        // For deep crawl, group by depth and show hierarchy
        if (deepCrawl && data.results.length > 1) {
          const summary = formatDeepCrawlResults(formattedResults, data.results, deepCrawl.maxDepth, savedPath);
          return {
            content: [{ type: "text", text: summary }],
            details: {
              results: data.results,
              proxyUsed: config.proxyEnabled,
              format,
              authProfile: authSelection?.profileName,
              authProfileReason: authSelection?.reason,
              savedPath,
              deepCrawl: {
                totalPages: data.results.length,
                maxDepth: deepCrawl.maxDepth,
              },
            },
          };
        }

        // Single URL or multi-URL (non-deep) format
        const saveNotice = savedPath ? `\n\n*Results saved to: ${savedPath}*` : "";
        const summary =
          formattedResults.length === 1
            ? `## ${formattedResults[0].url}\n\n${formattedResults[0].content}${saveNotice}`
            : formattedResults
                .map((r, i) => `---\n## Result ${i + 1}: ${r.url}\n\n${r.content}`)
                .join("\n\n") + saveNotice;

        return {
          content: [{ type: "text", text: summary }],
          details: {
            results: data.results,
            proxyUsed: config.proxyEnabled,
            format,
            authProfile: authSelection?.profileName,
            authProfileReason: authSelection?.reason,
            savedPath,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Crawl failed: ${message}`);
      }
    },
  });
}

/**
 * Format a single crawl result based on the requested format.
 */
function formatResult(
  result: CrawlResult,
  format: string
): { url: string; content: string } {
  if (!result.success) {
    return {
      url: result.url,
      content: `**Error crawling ${result.url}:** ${result.error_message || "Unknown error"}`,
    };
  }

  let content: string;

  switch (format) {
    case "html":
      content = result.html || "*No HTML content extracted*";
      break;
    case "links":
      const internal = result.links?.internal || [];
      const external = result.links?.external || [];
      content = [
        `### Internal Links (${internal.length})`,
        ...internal.slice(0, 50).map((l) => `- [${l.text}](${l.href})`),
        internal.length > 50 ? `... and ${internal.length - 50} more` : "",
        "",
        `### External Links (${external.length})`,
        ...external.slice(0, 50).map((l) => `- [${l.text}](${l.href})`),
        external.length > 50 ? `... and ${external.length - 50} more` : "",
      ]
        .filter(Boolean)
        .join("\n");
      break;
    case "markdown":
    default:
      // Handle both string and MarkdownGenerationResult object from crawl4ai API
      if (typeof result.markdown === "object" && result.markdown !== null) {
        const md = result.markdown as MarkdownGenerationResult;
        content = md.raw_markdown || "*No markdown content extracted*";
      } else {
        content = result.markdown || "*No markdown content extracted*";
      }
      break;
  }

  return { url: result.url, content };
}

/**
 * Format deep crawl results with depth grouping.
 */
function formatDeepCrawlResults(
  formattedResults: Array<{ url: string; content: string }>,
  rawResults: CrawlResult[],
  maxDepth: number,
  savedPath?: string
): string {
  // Group by depth
  const byDepth: Map<number, Array<{ url: string; content: string; success: boolean }>> = new Map();

  formattedResults.forEach((r, i) => {
    const depth = rawResults[i].metadata?.depth ?? 0;
    if (!byDepth.has(depth)) {
      byDepth.set(depth, []);
    }
    byDepth.get(depth)!.push({
      url: r.url,
      content: r.content,
      success: rawResults[i].success,
    });
  });

  // Build hierarchical output
  const sections: string[] = [];
  sections.push(`# Deep Crawl Results (${formattedResults.length} pages, max depth: ${maxDepth})\n`);
  
  if (savedPath) {
    sections.push(`*Results saved to: ${savedPath}*\n`);
  }

  for (let depth = 0; depth <= maxDepth; depth++) {
    const pages = byDepth.get(depth);
    if (!pages || pages.length === 0) continue;

    sections.push(`\n## Depth ${depth} (${pages.length} pages)\n`);

    pages.forEach((page) => {
      const prefix = page.success ? "" : "❌ ";
      sections.push(`\n### ${prefix}${page.url}\n\n${page.content}`);
    });
  }

  return sections.join("\n");
}
