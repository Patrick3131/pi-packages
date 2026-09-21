import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { SummaryReport } from "./document.js";
import type { RecapExchange } from "./session.js";
import { truncateAtLine } from "./text.js";

export interface RecapCostRates {
	input: number;
	output: number;
}

export interface RecapModelInfo {
	provider: string;
	id: string;
	cost: RecapCostRates;
}

export interface RecapUsageLike {
	input?: number;
	output?: number;
	cost?: { total?: number };
}

export interface RecapAssistantMessage {
	content?: unknown;
	usage?: RecapUsageLike;
	errorMessage?: string;
}

export interface RecapCompletionContext {
	systemPrompt?: string;
	messages: { role: "user"; content: string }[];
}

export interface RecapStream {
	result(): Promise<RecapAssistantMessage>;
}

/** Structural view of the pi model registry; avoids version-specific type coupling. */
export interface RecapModelRegistryLike {
	find?(provider: string, modelId: string): RecapModelInfo | undefined;
	streamSimple?(model: RecapModelInfo, context: RecapCompletionContext, options?: Record<string, unknown>): RecapStream;
	complete?(model: RecapModelInfo, context: RecapCompletionContext, options?: Record<string, unknown>): Promise<RecapAssistantMessage>;
}

export interface SummaryCacheEntry {
	hash: string;
	text: string;
}

export interface SummaryCache {
	version: number;
	entries: Record<string, SummaryCacheEntry>;
}

export interface SummaryPlan {
	pending: RecapExchange[];
	cached: RecapExchange[];
}

export interface SummaryEstimate {
	exchanges: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
}

export interface TranscriptOptions {
	maxCharsPerPrompt?: number;
	maxCharsPerAnswer?: number;
}

export interface SummaryRunOptions extends TranscriptOptions {
	exchanges: RecapExchange[];
	cache: SummaryCache;
	model: RecapModelInfo;
	registry: RecapModelRegistryLike;
	confirm?: (estimate: SummaryEstimate) => Promise<boolean>;
	budgetTokens?: number;
	/** Forwarded to session-routed providers (for example x-opencode-session). */
	sessionId?: string;
	signal?: AbortSignal;
}

export interface SummaryRunResult {
	cache: SummaryCache;
	report: SummaryReport;
}

const DEFAULT_MAX_PROMPT = 1200;
const DEFAULT_MAX_ANSWER = 900;
const DEFAULT_BUDGET_TOKENS = 30_000;
const MAX_OUTPUT_TOKENS = 4000;

export const SUMMARY_SYSTEM_PROMPT = [
	"You compress a coding-agent session so its owner can re-read it quickly.",
	"For every numbered exchange, write exactly one JSON object:",
	'{"id":<number>,"tl;dr":"<text>"}',
	"- tl;dr: at most 2 short sentences (~220 characters), in the user's language.",
	"- Focus on what was asked, what was decided or changed, and any open follow-up.",
	'- Use "" for greetings or acknowledgements with no substance.',
	"- Never invent details. Output JSON objects only, one per line, without a markdown fence.",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function excerpt(text: string, maxChars: number): string {
	const truncated = truncateAtLine(text, maxChars);
	return truncated.truncated ? `${truncated.head.trimEnd()}…` : text;
}

export function emptyCache(): SummaryCache {
	return { version: 1, entries: {} };
}

export function hashExchange(exchange: RecapExchange): string {
	return createHash("sha1").update(`${exchange.userText}\n---\n${exchange.answerText}`).digest("hex");
}

export function planSummary(exchanges: readonly RecapExchange[], cache: SummaryCache): SummaryPlan {
	const pending: RecapExchange[] = [];
	const cached: RecapExchange[] = [];
	for (const exchange of exchanges) {
		const entry = cache.entries[exchange.userEntryId];
		if (entry && entry.hash === hashExchange(exchange)) cached.push(exchange);
		else pending.push(exchange);
	}
	return { pending, cached };
}

export function buildTranscript(exchanges: readonly RecapExchange[], options: TranscriptOptions = {}): string {
	const maxPrompt = options.maxCharsPerPrompt ?? DEFAULT_MAX_PROMPT;
	const maxAnswer = options.maxCharsPerAnswer ?? DEFAULT_MAX_ANSWER;
	return exchanges
		.map((exchange) => {
			const prompt = excerpt(exchange.userText, maxPrompt);
			const answer = exchange.answerText ? excerpt(exchange.answerText, maxAnswer) : "(no answer)";
			return `[${exchange.index}] user: ${prompt}\n[${exchange.index}] assistant: ${answer}`;
		})
		.join("\n");
}

function buildCachedContext(exchanges: readonly RecapExchange[]): string {
	const lines = exchanges
		.filter((exchange) => exchange.summary)
		.map((exchange) => `[${exchange.index}] tl;dr: ${exchange.summary}`);
	return lines.length > 0 ? `Earlier exchanges in this session:\n${lines.join("\n")}` : "";
}

function addSummaryRecord(record: unknown, results: Map<number, string>): void {
	if (!isRecord(record)) return;
	const id = Number(record.id ?? record.index ?? record.exchange);
	const text = record["tl;dr"] ?? record.tldr ?? record.summary ?? record.text;
	if (!Number.isFinite(id) || typeof text !== "string") return;
	results.set(id, text.trim());
}

export function parseSummaryResponse(text: string): Map<number, string> {
	const results = new Map<number, string>();
	const stripped = text.replace(/```[a-zA-Z]*/gu, "").trim();
	if (stripped.startsWith("[") || stripped.startsWith("{")) {
		try {
			const parsed: unknown = JSON.parse(stripped);
			if (Array.isArray(parsed)) {
				for (const item of parsed) addSummaryRecord(item, results);
			} else {
				addSummaryRecord(parsed, results);
			}
		} catch {
			// fall through to line-by-line parsing
		}
	}
	for (const line of stripped.split(/\r?\n/u)) {
		const candidate = line.trim().replace(/,$/u, "");
		if (!candidate.startsWith("{")) continue;
		try {
			addSummaryRecord(JSON.parse(candidate), results);
		} catch {
			// ignore malformed lines, keep the rest of the response
		}
	}
	return results;
}

export function chunkExchanges(
	exchanges: readonly RecapExchange[],
	budgetTokens: number,
	options: TranscriptOptions = {},
): RecapExchange[][] {
	const budgetChars = Math.max(1, Math.floor(budgetTokens)) * 4;
	const chunks: RecapExchange[][] = [];
	let current: RecapExchange[] = [];
	let size = 0;
	for (const exchange of exchanges) {
		const itemSize =
			excerpt(exchange.userText, options.maxCharsPerPrompt ?? DEFAULT_MAX_PROMPT).length +
			excerpt(exchange.answerText, options.maxCharsPerAnswer ?? DEFAULT_MAX_ANSWER).length +
			60;
		if (current.length > 0 && size + itemSize > budgetChars) {
			chunks.push(current);
			current = [];
			size = 0;
		}
		current.push(exchange);
		size += itemSize;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

export function estimateSummary(
	pending: readonly RecapExchange[],
	cached: readonly RecapExchange[],
	cost: RecapCostRates,
	options: TranscriptOptions = {},
): SummaryEstimate {
	const contextChars = buildCachedContext(cached).length + SUMMARY_SYSTEM_PROMPT.length;
	const transcriptChars = buildTranscript(pending, options).length + contextChars;
	const inputTokens = Math.ceil(transcriptChars / 4) + 250;
	const outputTokens = pending.length * 80 + 40;
	const costUsd = (inputTokens * cost.input + outputTokens * cost.output) / 1_000_000;
	return { exchanges: pending.length, inputTokens, outputTokens, costUsd };
}

export function applySummaries(exchanges: readonly RecapExchange[], cache: SummaryCache): void {
	for (const exchange of exchanges) {
		const entry = cache.entries[exchange.userEntryId];
		if (entry && entry.hash === hashExchange(exchange)) {
			exchange.summary = entry.text ? entry.text : undefined;
		}
	}
}

function assistantText(message: RecapAssistantMessage): string {
	if (!Array.isArray(message.content)) return "";
	const parts: string[] = [];
	for (const part of message.content) {
		if (isRecord(part) && part.type === "text" && typeof part.text === "string") parts.push(part.text);
	}
	return parts.join("\n").trim();
}

function costFromUsage(usage: RecapUsageLike | undefined, rates: RecapCostRates): number {
	if (!usage) return 0;
	const reported = usage.cost?.total;
	if (typeof reported === "number" && reported > 0) return reported;
	return ((usage.input ?? 0) * rates.input + (usage.output ?? 0) * rates.output) / 1_000_000;
}

async function callModel(
	registry: RecapModelRegistryLike,
	model: RecapModelInfo,
	system: string,
	user: string,
	maxTokens: number,
	sessionId: string | undefined,
	signal: AbortSignal | undefined,
): Promise<RecapAssistantMessage> {
	const context: RecapCompletionContext = { systemPrompt: system, messages: [{ role: "user", content: user }] };
	const options: Record<string, unknown> = {
		maxTokens,
		temperature: 0.2,
		reasoning: "off",
		cacheRetention: "short",
	};
	if (sessionId) options.sessionId = sessionId;
	if (signal) options.signal = signal;
	if (typeof registry.streamSimple === "function") {
		return registry.streamSimple(model, context, options).result();
	}
	if (typeof registry.complete === "function") {
		return registry.complete(model, context, options);
	}
	throw new Error("model registry does not support completions");
}

export async function runSummarize(options: SummaryRunOptions): Promise<SummaryRunResult> {
	const { exchanges, model, registry, confirm, signal } = options;
	const transcriptOptions: TranscriptOptions = {
		maxCharsPerPrompt: options.maxCharsPerPrompt,
		maxCharsPerAnswer: options.maxCharsPerAnswer,
	};
	const cache: SummaryCache = { version: 1, entries: { ...options.cache.entries } };
	applySummaries(exchanges, cache);

	const plan = planSummary(exchanges, cache);
	const label = `${model.provider}/${model.id}`;
	if (plan.pending.length === 0) {
		return {
			cache,
			report: {
				status: "ok",
				model: label,
				summarized: 0,
				cached: plan.cached.length,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
			},
		};
	}

	const estimate = estimateSummary(plan.pending, plan.cached, model.cost, transcriptOptions);
	if (confirm && !(await confirm(estimate))) {
		return {
			cache,
			report: {
				status: "skipped",
				model: label,
				summarized: 0,
				cached: plan.cached.length,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
			},
		};
	}

	const chunks = chunkExchanges(plan.pending, options.budgetTokens ?? DEFAULT_BUDGET_TOKENS, transcriptOptions);
	let summarized = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let costUsd = 0;
	let error: string | undefined;

	for (const chunk of chunks) {
		try {
			const context = buildCachedContext(plan.cached);
			const transcript = buildTranscript(chunk, transcriptOptions);
			const user = [context, transcript, "Respond with one JSON object per line."].filter(Boolean).join("\n\n");
			const maxTokens = Math.min(chunk.length * 80 + 40, MAX_OUTPUT_TOKENS);
			const response = await callModel(registry, model, SUMMARY_SYSTEM_PROMPT, user, maxTokens, options.sessionId, signal);
			const text = assistantText(response);
			if (!text && response.errorMessage) throw new Error(response.errorMessage);
			const parsed = parseSummaryResponse(text);
			for (const exchange of chunk) {
				const summary = parsed.get(exchange.index);
				if (summary === undefined) continue;
				cache.entries[exchange.userEntryId] = { hash: hashExchange(exchange), text: summary };
				summarized++;
			}
			inputTokens += response.usage?.input ?? 0;
			outputTokens += response.usage?.output ?? 0;
			costUsd += costFromUsage(response.usage, model.cost);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : String(caught);
			break;
		}
	}

	applySummaries(exchanges, cache);

	return {
		cache,
		report: {
			status: error ? "failed" : "ok",
			model: label,
			summarized,
			cached: plan.cached.length,
			inputTokens,
			outputTokens,
			costUsd,
			error,
		},
	};
}

export function loadSummaryCache(path: string): SummaryCache {
	if (!existsSync(path)) return emptyCache();
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
		if (!isRecord(parsed) || !isRecord(parsed.entries)) return emptyCache();
		const entries: Record<string, SummaryCacheEntry> = {};
		for (const [key, value] of Object.entries(parsed.entries)) {
			if (isRecord(value) && typeof value.hash === "string" && typeof value.text === "string") {
				entries[key] = { hash: value.hash, text: value.text };
			}
		}
		return { version: 1, entries };
	} catch {
		return emptyCache();
	}
}

export function saveSummaryCache(path: string, cache: SummaryCache): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}
