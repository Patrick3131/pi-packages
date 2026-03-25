/**
 * Crawl tool implementation for pi-crawl4ai.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { buildBrowserConfig } from "../../config";
import type { CrawlToolParams, CrawlResult, Crawl4AIResponse } from "./types";

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
      "SPAs, or when you need structured content extraction.",
    parameters: Type.Object({
      urls: Type.Array(Type.String(), {
        description: "URLs to crawl (one or more)",
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
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { urls, format = "markdown", waitFor, jsCode, bypassCache } = params as CrawlToolParams;

      // Build the request payload
      const browserConfig = buildBrowserConfig(config);

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

      // Add format-specific config
      if (format === "markdown") {
        crawlerConfig.markdown_generator = true;
      }

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

        const summary =
          formattedResults.length === 1
            ? `## ${formattedResults[0].url}\n\n${formattedResults[0].content}`
            : formattedResults
                .map((r, i) => `---\n## Result ${i + 1}: ${r.url}\n\n${r.content}`)
                .join("\n\n");

        return {
          content: [{ type: "text", text: summary }],
          details: {
            results: data.results,
            proxyUsed: config.proxyEnabled,
            format,
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
      content = result.markdown || "*No markdown content extracted*";
      break;
  }

  return { url: result.url, content };
}
