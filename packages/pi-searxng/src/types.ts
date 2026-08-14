export const DEFAULT_SEARXNG_URL = "http://10.8.0.1:18089";
export const DEFAULT_ENGINES = "brave,duckduckgo";
export const DEFAULT_MAX_RESULTS = 5;
export const MAX_RESULTS_LIMIT = 20;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const TOOL_NAME = "web_search_searxng";

export type TimeRange = "day" | "month" | "year";
export type SafeSearch = 0 | 1 | 2;

export type SearxngSearchParams = {
	query: string;
	maxResults?: number;
	engines?: string;
	categories?: string;
	language?: string;
	timeRange?: TimeRange;
	safesearch?: SafeSearch;
	page?: number;
	timeoutMs?: number;
};

export type NormalizedSearchResult = {
	title: string;
	url: string;
	content?: string;
	engine?: string;
	engines?: string[];
	category?: string;
	publishedDate?: string;
};

export type SearxngSearchDetails = {
	query: string;
	baseUrl: string;
	count: number;
	page: number;
	results: NormalizedSearchResult[];
	suggestions?: string[];
	unresponsiveEngines?: unknown[];
};
