import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { isSearxngEnabledByEnv, resolveSearxngBaseUrl } from "./config.js";
import { searchSearxng, truncateSnippet } from "./search.js";
import {
	DEFAULT_MAX_RESULTS,
	DEFAULT_TIMEOUT_MS,
	MAX_RESULTS_LIMIT,
	TOOL_NAME,
	type SearxngSearchDetails,
} from "./types.js";

function getHostName(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function projectToolsWantSearxng(cwd: string | undefined): boolean {
	if (!cwd) {
		return false;
	}
	try {
		const path = join(cwd, CONFIG_DIR_NAME, "tools.json");
		if (!existsSync(path)) {
			return false;
		}
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		return typeof parsed === "object" && parsed !== null && (parsed as Record<string, unknown>)[TOOL_NAME] === true;
	} catch {
		return false;
	}
}

function disableUnlessRequested(pi: ExtensionAPI, ctx?: Pick<ExtensionContext, "cwd">): void {
	if (isSearxngEnabledByEnv()) return;
	if (typeof pi.getFlag("preset") === "string" && pi.getFlag("preset")) return;
	if (projectToolsWantSearxng(ctx?.cwd)) return;
	const active = pi.getActiveTools();
	if (!active.includes(TOOL_NAME)) return;
	pi.setActiveTools(active.filter((name) => name !== TOOL_NAME));
}

export default function piSearxngExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: TOOL_NAME,
		label: "SearXNG search",
		description:
			"Search the web through the self-hosted discovery-services SearXNG instance (Brave + DuckDuckGo). Off by default. Enable with /tools, /preset research, or PI_SEARXNG_ENABLED=1. Does not use xAI web search.",
		promptSnippet: "web_search_searxng(query): search the self-hosted SearXNG instance; off by default",
		promptGuidelines: [
			"Use web_search_searxng only when the user asks for live web search through the self-hosted SearXNG instance.",
			"Do not use web_search_searxng for ordinary coding work. Prefer local files first.",
			"This is not Grok/xAI web_search. Leave xAI search to /xai-tools.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "The search query to execute." }),
			max_results: Type.Optional(
				Type.Number({
					description: `Maximum results to return. Default: ${DEFAULT_MAX_RESULTS}.`,
					default: DEFAULT_MAX_RESULTS,
					minimum: 1,
					maximum: MAX_RESULTS_LIMIT,
				}),
			),
			engines: Type.Optional(
				Type.String({
					description: "Comma-separated SearXNG engines. Default: brave,duckduckgo.",
				}),
			),
			categories: Type.Optional(Type.String({ description: "Comma-separated SearXNG categories." })),
			language: Type.Optional(Type.String({ description: "Search language code, for example en." })),
			time_range: Type.Optional(
				Type.Union([Type.Literal("day"), Type.Literal("month"), Type.Literal("year")], {
					description: "Restrict results to a time range when the engines support it.",
				}),
			),
			page: Type.Optional(Type.Number({ description: "Result page number. Default: 1.", default: 1, minimum: 1 })),
		}),
		async execute(_toolCallId, params, signal) {
			const result = await searchSearxng(
				{
					query: params.query,
					maxResults: params.max_results,
					engines: params.engines,
					categories: params.categories,
					language: params.language,
					timeRange: params.time_range,
					page: params.page,
					timeoutMs: DEFAULT_TIMEOUT_MS,
				},
				{ signal },
			);
			return {
				content: [{ type: "text" as const, text: result.text }],
				details: result.details,
			};
		},
		renderCall(args, theme) {
			const query = typeof args.query === "string" ? args.query : "...";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("web_search_searxng "))}${theme.fg("accent", query)}`,
				0,
				0,
			);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as SearxngSearchDetails | undefined;
			if (!details) return new Text(theme.fg("muted", "No search details available."), 0, 0);
			if (details.results.length === 0) {
				return new Text(theme.fg("muted", `No results for ${details.query}`), 0, 0);
			}
			const lines = [theme.fg("toolTitle", theme.bold(`SearXNG results (${details.count})`))];
			details.results.forEach((item, index) => {
				lines.push(`${index + 1}. ${theme.fg("text", item.title)} ${theme.fg("muted", "—")} ${theme.fg("accent", getHostName(item.url))}`);
				if (expanded) {
					lines.push(`   ${theme.fg("dim", item.url)}`);
					const snippet = truncateSnippet(item.content, 160);
					if (snippet) lines.push(`   ${theme.fg("muted", snippet)}`);
				}
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		disableUnlessRequested(pi, ctx);
	});
}

export { resolveSearxngBaseUrl, isSearxngEnabledByEnv };
