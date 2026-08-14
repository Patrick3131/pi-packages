import { assertHttpUrl, resolveDefaultEngines, resolveSearxngBaseUrl } from "./config.js";
import {
	DEFAULT_MAX_RESULTS,
	DEFAULT_TIMEOUT_MS,
	MAX_RESULTS_LIMIT,
	type NormalizedSearchResult,
	type SearxngSearchDetails,
	type SearxngSearchParams,
} from "./types.js";

type SearxngRawResult = {
	title?: unknown;
	url?: unknown;
	content?: unknown;
	engine?: unknown;
	engines?: unknown;
	category?: unknown;
	publishedDate?: unknown;
	published_date?: unknown;
};

type SearxngRawResponse = {
	results?: unknown;
	suggestions?: unknown;
	unresponsive_engines?: unknown;
};

export function clampInteger(value: number | undefined, defaultValue: number, min: number, max: number): number {
	if (value === undefined || !Number.isFinite(value)) return defaultValue;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

export function asString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const values = value.flatMap((item) => {
		const normalized = asString(item);
		return normalized ? [normalized] : [];
	});
	return values.length > 0 ? values : undefined;
}

export function normalizeSearchResult(result: SearxngRawResult): NormalizedSearchResult | undefined {
	const url = asString(result.url);
	if (!url) return undefined;
	const title = asString(result.title) ?? url;
	const content = asString(result.content);
	const engine = asString(result.engine);
	const engines = asStringArray(result.engines);
	const category = asString(result.category);
	const publishedDate = asString(result.publishedDate) ?? asString(result.published_date);
	return {
		title,
		url,
		...(content ? { content } : {}),
		...(engine ? { engine } : {}),
		...(engines ? { engines } : {}),
		...(category ? { category } : {}),
		...(publishedDate ? { publishedDate } : {}),
	};
}

export function normalizeResults(results: unknown, maxResults: number): NormalizedSearchResult[] {
	if (!Array.isArray(results)) return [];
	const seenUrls = new Set<string>();
	const normalized: NormalizedSearchResult[] = [];
	for (const item of results) {
		if (!item || typeof item !== "object") continue;
		const result = normalizeSearchResult(item as SearxngRawResult);
		if (!result || seenUrls.has(result.url)) continue;
		seenUrls.add(result.url);
		normalized.push(result);
		if (normalized.length >= maxResults) break;
	}
	return normalized;
}

export function buildSearchUrl(
	params: SearxngSearchParams,
	baseUrl = resolveSearxngBaseUrl(),
	defaultEngines = resolveDefaultEngines(),
): URL {
	assertHttpUrl(baseUrl);
	const maxResults = clampInteger(params.maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS_LIMIT);
	const page = clampInteger(params.page, 1, 1, 1_000);
	const url = new URL("/search", `${baseUrl}/`);
	url.searchParams.set("q", params.query);
	url.searchParams.set("format", "json");
	url.searchParams.set("pageno", String(page));
	url.searchParams.set("safesearch", String(params.safesearch ?? 0));
	const engines = params.engines?.trim() || defaultEngines;
	if (engines) url.searchParams.set("engines", engines);
	if (params.categories) url.searchParams.set("categories", params.categories);
	if (params.language) url.searchParams.set("language", params.language);
	if (params.timeRange) url.searchParams.set("time_range", params.timeRange);
	url.searchParams.set("count", String(maxResults));
	return url;
}

export function truncateSnippet(value: string | undefined, maxLength = 240): string | undefined {
	if (!value) return undefined;
	const compact = value.replace(/\s+/g, " ").trim();
	if (compact.length <= maxLength) return compact;
	return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildResponseText(query: string, results: NormalizedSearchResult[]): string {
	if (results.length === 0) return `No results found for: ${query}`;
	const lines = [`Search results for: ${query}`, ""];
	results.forEach((result, index) => {
		lines.push(`${index + 1}. ${result.title}`);
		lines.push(`   URL: ${result.url}`);
		const snippet = truncateSnippet(result.content);
		if (snippet) lines.push(`   ${snippet}`);
		const source = result.engine ?? result.engines?.join(", ");
		const metadata = [source, result.publishedDate, result.category].filter(Boolean).join(" · ");
		if (metadata) lines.push(`   ${metadata}`);
		if (index < results.length - 1) lines.push("");
	});
	return lines.join("\n");
}

function createTimeoutSignal(parentSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	if (!parentSignal) return timeoutSignal;
	return AbortSignal.any([parentSignal, timeoutSignal]);
}

export async function searchSearxng(
	params: SearxngSearchParams,
	options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<{ text: string; details: SearxngSearchDetails }> {
	const query = params.query.trim();
	if (!query) throw new Error("web_search_searxng requires a query.");
	const env = options.env ?? process.env;
	const baseUrl = resolveSearxngBaseUrl(env);
	const maxResults = clampInteger(params.maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS_LIMIT);
	const page = clampInteger(params.page, 1, 1, 1_000);
	const timeoutMs = clampInteger(params.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 60_000);
	const url = buildSearchUrl(params, baseUrl, resolveDefaultEngines(env));
	const fetchImpl = options.fetchImpl ?? fetch;

	let response: Response;
	try {
		response = await fetchImpl(url, {
			headers: { Accept: "application/json" },
			signal: createTimeoutSignal(options.signal, timeoutMs),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/fetch failed|ECONNREFUSED|Failed to fetch|AbortError|TimeoutError/i.test(message)) {
			throw new Error(
				`Could not connect to SearXNG at ${baseUrl}. Set SEARXNG_URL to the VPN or Docker-bridge bind (default ${baseUrl}).`,
			);
		}
		throw error;
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		const hint =
			response.status === 403
				? " JSON output may be disabled; this instance should already enable format=json."
				: "";
		throw new Error(`SearXNG search failed (${response.status})${hint}${body ? `: ${body.slice(0, 300)}` : ""}`);
	}

	const data = (await response.json()) as SearxngRawResponse;
	const results = normalizeResults(data.results, maxResults);
	const details: SearxngSearchDetails = {
		query,
		baseUrl,
		count: results.length,
		page,
		results,
		suggestions: asStringArray(data.suggestions),
		unresponsiveEngines: Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : undefined,
	};
	return { text: buildResponseText(query, results), details };
}
