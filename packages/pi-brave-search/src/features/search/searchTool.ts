import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BraveSearchConfig } from "../../config";
import type {
  BraveSearchToolParams,
  BraveWebSearchApiItem,
  BraveWebSearchApiResponse,
  BraveWebSearchResult,
} from "./types";

let lastRequestStartedAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

const MAX_429_RETRIES = 2;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Request cancelled"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function applyRateLimit(config: BraveSearchConfig, signal?: AbortSignal): Promise<number> {
  const now = Date.now();
  const elapsed = now - lastRequestStartedAt;
  const waitMs = Math.max(0, config.minRequestIntervalMs - elapsed);

  if (waitMs > 0) {
    await sleep(waitMs, signal);
  }

  lastRequestStartedAt = Date.now();
  return waitMs;
}

function enqueueBraveSearch<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const run = async () => {
    if (signal?.aborted) {
      throw new Error("Request cancelled");
    }

    return job();
  };

  const scheduled = requestQueue.then(run, run);
  requestQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

export function resetBraveSearchRateLimit(): void {
  lastRequestStartedAt = 0;
  requestQueue = Promise.resolve();
}

function prepareArguments(args: unknown): unknown {
  if (!args || typeof args !== "object") {
    return args;
  }

  const input = args as Record<string, unknown>;
  const next: Record<string, unknown> = { ...input };

  if (typeof next.query !== "string") {
    const alias = next.q ?? next.searchQuery ?? next.search;
    if (typeof alias === "string") {
      next.query = alias;
    }
  }

  return next;
}

function getHeader(response: Response, name: string): string | null {
  const headers = (response as { headers?: { get?: (headerName: string) => string | null } }).headers;
  return headers?.get?.(name) ?? null;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return Math.max(0, dateMs - Date.now());
}

async function fetchWith429Retry(
  url: URL,
  config: BraveSearchConfig,
  controller: AbortController,
  signal?: AbortSignal
): Promise<{ response: Response; retryCount: number; retryWaitedMs: number }> {
  let retryCount = 0;
  let retryWaitedMs = 0;

  while (true) {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": config.apiKey!,
      },
      signal: controller.signal,
    });

    if (response.status !== 429 || retryCount >= MAX_429_RETRIES) {
      return { response, retryCount, retryWaitedMs };
    }

    const retryAfterMs = parseRetryAfterMs(getHeader(response, "retry-after"));
    const backoffMs = retryAfterMs ?? config.minRequestIntervalMs * 2 ** retryCount;
    const waitMs = Math.max(config.minRequestIntervalMs, backoffMs);

    await sleep(waitMs, signal);
    retryWaitedMs += waitMs;
    lastRequestStartedAt = Date.now();
    retryCount += 1;
  }
}

function normalizeResult(item: BraveWebSearchApiItem): BraveWebSearchResult | undefined {
  if (!item.url || !item.title) {
    return undefined;
  }

  return {
    title: item.title,
    url: item.url,
    description: item.description,
    language: item.language,
    age: item.age,
    pageAge: item.page_age,
  };
}

function formatResult(result: BraveWebSearchResult, index: number): string {
  const lines = [`${index}. [${result.title}](${result.url})`];

  if (result.description) {
    lines.push(`   ${result.description}`);
  }

  const meta = [result.language, result.age ?? result.pageAge].filter(Boolean).join(" • ");
  if (meta) {
    lines.push(`   ${meta}`);
  }

  return lines.join("\n");
}

export function registerBraveSearchTool(pi: ExtensionAPI, config: BraveSearchConfig): void {
  pi.registerTool({
    name: "brave_search",
    label: "Brave Web Search",
    description:
      "Search the web using Brave Search and return ranked results with titles, URLs, and snippets. " +
      "Use this to discover relevant pages first, then crawl selected result URLs with crawl4ai if full page extraction is needed.",
    promptSnippet: "Search the web with Brave Search. Use crawl on returned URLs when the user needs full page content.",
    promptGuidelines: [
      "Use brave_search for web discovery and result lists.",
      "If the user already gives you a concrete URL and wants the page contents, use crawl instead of search.",
      "After brave_search, crawl only the most relevant returned URLs when deeper page extraction is needed.",
    ],
    prepareArguments,
    parameters: Type.Object({
      query: Type.String({
        description: "Search query string.",
        minLength: 1,
      }),
      count: Type.Optional(
        Type.Number({
          description: "Number of results to return (default: 10, max: 20).",
          minimum: 1,
          maximum: 20,
        })
      ),
      offset: Type.Optional(
        Type.Number({
          description: "Result offset for pagination.",
          minimum: 0,
        })
      ),
      country: Type.Optional(
        Type.String({
          description: "Country code used for localization, e.g. US, DE.",
        })
      ),
      searchLang: Type.Optional(
        Type.String({
          description: "Search language code, e.g. en, de.",
        })
      ),
      uiLang: Type.Optional(
        Type.String({
          description: "UI language locale, e.g. en-US.",
        })
      ),
      safesearch: Type.Optional(
        Type.Union([Type.Literal("off"), Type.Literal("moderate"), Type.Literal("strict")], {
          description: "Safe search setting.",
        })
      ),
      freshness: Type.Optional(
        Type.Union([Type.Literal("pd"), Type.Literal("pw"), Type.Literal("pm"), Type.Literal("py")], {
          description: "Freshness filter: pd=day, pw=week, pm=month, py=year.",
        })
      ),
      extraSnippets: Type.Optional(
        Type.Boolean({
          description: "Request extra snippets when available.",
        })
      ),
    }),
    async execute(_toolCallId: string, params: BraveSearchToolParams, signal?: AbortSignal) {
      if (!config.apiKey) {
        throw new Error(
          "Brave Search is not configured. Set BRAVE_SEARCH_API_KEY or add apiKey to .pi/brave-search.json."
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      const abortHandler = () => controller.abort();
      signal?.addEventListener("abort", abortHandler, { once: true });

      try {
        const result = await enqueueBraveSearch(async () => {
          const url = new URL(`${config.baseUrl}/web/search`);
          url.searchParams.set("q", params.query);
          url.searchParams.set("count", String(params.count ?? 10));

          if (params.offset !== undefined) {
            url.searchParams.set("offset", String(params.offset));
          }
          if (params.country) {
            url.searchParams.set("country", params.country);
          }
          if (params.searchLang) {
            url.searchParams.set("search_lang", params.searchLang);
          }
          if (params.uiLang) {
            url.searchParams.set("ui_lang", params.uiLang);
          }
          if (params.safesearch) {
            url.searchParams.set("safesearch", params.safesearch);
          }
          if (params.freshness) {
            url.searchParams.set("freshness", params.freshness);
          }
          if (params.extraSnippets !== undefined) {
            url.searchParams.set("extra_snippets", String(params.extraSnippets));
          }

          const rateLimitWaitedMs = await applyRateLimit(config, signal);
          const { response, retryCount, retryWaitedMs } = await fetchWith429Retry(url, config, controller, signal);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Brave Search API error (${response.status}): ${errorText}`);
          }

          const data = (await response.json()) as BraveWebSearchApiResponse;
          const results = (data.web?.results ?? []).map(normalizeResult).filter(Boolean) as BraveWebSearchResult[];
          const effectiveQuery = data.query?.altered || data.query?.original || params.query;

          const body = results.length
            ? results.map((result, index) => formatResult(result, index + 1)).join("\n\n")
            : "No web results returned.";

          return {
            content: [{
              type: "text",
              text: [`# Brave Search`, ``, `Query: ${effectiveQuery}`, `Results: ${results.length}`, ``, body].join("\n"),
            }],
            details: {
              query: params.query,
              effectiveQuery,
              results,
              resultCount: results.length,
              rateLimitWaitedMs,
              retryCount,
              retryWaitedMs,
              minRequestIntervalMs: config.minRequestIntervalMs,
            },
          };
        }, signal);

        return result;
      } catch (error) {
        if (controller.signal.aborted && !signal?.aborted) {
          throw new Error(`Brave Search failed: Request timed out after ${config.timeoutMs}ms`);
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Brave Search failed: ${message}`);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortHandler);
      }
    },
  } as any);
}
