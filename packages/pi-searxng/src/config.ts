import { DEFAULT_ENGINES, DEFAULT_SEARXNG_URL } from "./types.js";

export function isSearxngEnabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	const value = env.PI_SEARXNG_ENABLED?.trim() || env.SEARXNG_SEARCH_ENABLED?.trim();
	return value === "1" || value?.toLowerCase() === "true";
}

export function resolveSearxngBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const raw = env.SEARXNG_URL?.trim() || DEFAULT_SEARXNG_URL;
	return raw.replace(/\/+$/, "");
}

export function resolveDefaultEngines(env: NodeJS.ProcessEnv = process.env): string {
	return env.SEARXNG_ENGINES?.trim() || DEFAULT_ENGINES;
}

export function assertHttpUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`SEARXNG_URL is not a valid URL (got: ${url})`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`SEARXNG_URL must use http:// or https:// (got: ${parsed.protocol})`);
	}
}
