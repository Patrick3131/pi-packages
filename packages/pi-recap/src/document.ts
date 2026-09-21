import type { RecapSession } from "./session.js";

export interface SummaryReport {
	status: "ok" | "skipped" | "failed";
	model: string;
	summarized: number;
	cached: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	error?: string;
}

export interface RecapDocument {
	title: string;
	generatedAt: string;
	previewChars: number;
	messages: boolean;
	session: RecapSession;
	summary?: SummaryReport;
}

export interface BuildDocumentOptions {
	messages?: boolean;
	now?: Date;
}

export function buildDocument(session: RecapSession, previewChars: number, options: BuildDocumentOptions = {}): RecapDocument {
	return {
		title: session.name?.trim() || session.sessionId,
		generatedAt: (options.now ?? new Date()).toISOString(),
		previewChars,
		messages: options.messages === true,
		session,
	};
}
