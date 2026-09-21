import { readFileSync } from "node:fs";
import { basename } from "node:path";

export interface SessionHeader {
	type: "session";
	id?: string;
	cwd?: string;
	timestamp?: string;
	parentSession?: string;
	version?: number;
	[key: string]: unknown;
}

export interface SessionMessageLike {
	role?: string;
	content?: unknown;
	provider?: string;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	isError?: boolean;
	[key: string]: unknown;
}

export interface SessionEntry {
	type: string;
	id: string;
	parentId?: string | null;
	timestamp?: string;
	message?: SessionMessageLike;
	[key: string]: unknown;
}

export interface ParsedSessionFile {
	header: SessionHeader | null;
	entries: SessionEntry[];
	skippedLines: number;
}

export interface RecapStats {
	totalEntries: number;
	userMessages: number;
	assistantMessages: number;
	toolResults: number;
	compactions: number;
}

export interface RecapExchange {
	index: number;
	userEntryId: string;
	timestamp: string;
	userText: string;
	answerText: string;
	toolNames: string[];
	toolCallCount: number;
	toolErrorCount: number;
	summary?: string;
}

export interface RecapSession {
	sessionId: string;
	sessionFile?: string;
	cwd?: string;
	name?: string;
	model?: string;
	createdAt?: string;
	stats: RecapStats;
	exchanges: RecapExchange[];
}

export interface RecapSessionMeta {
	sessionId: string;
	sessionFile?: string;
	cwd?: string;
	name?: string;
	model?: string;
	createdAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSessionJsonl(content: string): ParsedSessionFile {
	let header: SessionHeader | null = null;
	const entries: SessionEntry[] = [];
	let skippedLines = 0;

	for (const line of content.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			skippedLines++;
			continue;
		}
		if (!isRecord(parsed)) {
			skippedLines++;
			continue;
		}
		if (parsed.type === "session") {
			if (!header) header = parsed as unknown as SessionHeader;
			continue;
		}
		if (typeof parsed.id !== "string" || parsed.id.length === 0) {
			skippedLines++;
			continue;
		}
		entries.push(parsed as unknown as SessionEntry);
	}

	return { header, entries, skippedLines };
}

/** Walk parent links from the last entry to the root; fall back to file order for linear sessions. */
export function buildBranch(entries: readonly SessionEntry[]): SessionEntry[] {
	if (entries.length === 0) return [];
	const linear = entries.every((entry, index) =>
		index === 0 ? entry.parentId == null : entry.parentId === entries[index - 1].id,
	);
	const anyLinks = entries.some((entry) => entry.parentId != null);
	if (linear || !anyLinks) return [...entries];

	const byId = new Map<string, SessionEntry>();
	for (const entry of entries) byId.set(entry.id, entry);

	const path: SessionEntry[] = [];
	const seen = new Set<string>();
	let cursor: SessionEntry | undefined = entries[entries.length - 1];
	while (cursor) {
		if (seen.has(cursor.id)) break;
		seen.add(cursor.id);
		path.unshift(cursor);
		cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
	}
	return path;
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (!isRecord(part)) continue;
		if (part.type === "text" && typeof part.text === "string") parts.push(part.text);
		else if (part.type === "image") parts.push("[image]");
	}
	return parts.join("\n");
}

function timestampOf(entry: SessionEntry, message: SessionMessageLike | undefined): string {
	const raw = message?.timestamp;
	if (typeof raw === "number") return new Date(raw).toISOString();
	if (typeof raw === "string") return raw;
	return entry.timestamp ?? "";
}

export function extractRecap(branch: readonly SessionEntry[], meta: RecapSessionMeta): RecapSession {
	const stats: RecapStats = {
		totalEntries: branch.length,
		userMessages: 0,
		assistantMessages: 0,
		toolResults: 0,
		compactions: 0,
	};
	const exchanges: RecapExchange[] = [];
	let current: RecapExchange | null = null;
	let name = meta.name;
	let model = meta.model;

	for (const entry of branch) {
		if (entry.type === "session_info") {
			if (typeof entry.name === "string" && entry.name.trim()) name = entry.name;
			continue;
		}
		if (entry.type === "model_change") {
			const provider = typeof entry.provider === "string" ? entry.provider : undefined;
			const modelId = typeof entry.modelId === "string" ? entry.modelId : undefined;
			if (provider && modelId) model = `${provider}/${modelId}`;
			continue;
		}
		if (entry.type === "compaction") {
			stats.compactions++;
			continue;
		}
		if (entry.type !== "message") continue;

		const message = entry.message;
		switch (message?.role) {
			case "user": {
				const text = contentText(message.content).trim();
				if (!text) break;
				stats.userMessages++;
				current = {
					index: exchanges.length + 1,
					userEntryId: entry.id,
					timestamp: timestampOf(entry, message),
					userText: text,
					answerText: "",
					toolNames: [],
					toolCallCount: 0,
					toolErrorCount: 0,
				};
				exchanges.push(current);
				break;
			}
			case "assistant": {
				stats.assistantMessages++;
				if (message.provider && message.model) model = `${message.provider}/${message.model}`;
				if (!current) break;
				const text = contentText(message.content).trim();
				if (text) current.answerText = current.answerText ? `${current.answerText}\n\n${text}` : text;
				if (Array.isArray(message.content)) {
					for (const part of message.content) {
						if (!isRecord(part) || part.type !== "toolCall") continue;
						current.toolCallCount++;
						if (typeof part.name === "string" && !current.toolNames.includes(part.name)) {
							current.toolNames.push(part.name);
						}
					}
				}
				break;
			}
			case "toolResult": {
				stats.toolResults++;
				if (current && message.isError === true) current.toolErrorCount++;
				break;
			}
			default:
				break;
		}
	}

	return { ...meta, name, model, stats, exchanges };
}

function sessionIdFromFile(file: string): string {
	return basename(file).replace(/\.jsonl$/u, "");
}

export function readSessionFile(file: string): RecapSession {
	const content = readFileSync(file, "utf-8");
	const parsed = parseSessionJsonl(content);
	const branch = buildBranch(parsed.entries);
	return extractRecap(branch, {
		sessionId: parsed.header?.id ?? sessionIdFromFile(file),
		sessionFile: file,
		cwd: parsed.header?.cwd,
		createdAt: parsed.header?.timestamp,
	});
}

export function sessionFromBranch(entries: readonly SessionEntry[], meta: RecapSessionMeta): RecapSession {
	return extractRecap(buildBranch(entries), meta);
}
