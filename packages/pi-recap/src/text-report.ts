import type { RecapDocument } from "./document.js";
import type { RecapExchange } from "./session.js";
import { firstLine, formatCount, formatTimestamp, formatUsd, truncateAtLine } from "./text.js";

function renderToolLine(exchange: RecapExchange): string {
	if (exchange.toolCallCount === 0) return "";
	const names = exchange.toolNames.length > 0 ? ` (${exchange.toolNames.join(", ")})` : "";
	const errors = exchange.toolErrorCount > 0 ? `, ${exchange.toolErrorCount} error${exchange.toolErrorCount === 1 ? "" : "s"}` : "";
	return `   tools: ${formatCount(exchange.toolCallCount)} calls${names}${errors}`;
}

function renderExchange(exchange: RecapExchange, previewChars: number, messages: boolean): string {
	const lines: string[] = [`## ${exchange.index}. ${firstLine(exchange.userText, 120)}`, ""];
	const stamp = formatTimestamp(exchange.timestamp);
	if (stamp) lines.push(`   ${stamp}`, "");
	lines.push(exchange.userText, "");
	lines.push("   ANSWER");
	if (!exchange.answerText) {
		lines.push("   (no answer text)");
	} else {
		const preview = messages
			? { head: exchange.answerText, tail: "", truncated: false }
			: truncateAtLine(exchange.answerText, previewChars);
		lines.push(preview.head.trim() || preview.tail.trim());
		if (preview.truncated) {
			const remaining = exchange.answerText.length - preview.head.length;
			lines.push(`   … [truncated, ${formatCount(remaining)} more characters]`);
		}
	}
	if (!messages && exchange.summary) {
		lines.push("", `   TL;DR: ${exchange.summary}`);
	}
	const tools = messages ? "" : renderToolLine(exchange);
	if (tools) lines.push("", tools);
	return lines.join("\n");
}

export function renderRecapText(doc: RecapDocument): string {
	const session = doc.session;
	const meta = [
		`Session: ${session.sessionId}`,
		session.cwd ? `CWD: ${session.cwd}` : "",
		session.model ? `Model: ${session.model}` : "",
		`Exchanges: ${formatCount(session.exchanges.length)}`,
		`Generated: ${formatTimestamp(doc.generatedAt)}`,
	].filter(Boolean);
	if (doc.summary && !doc.messages) {
		meta.push(
			`Summaries: ${doc.summary.model}, ${formatCount(doc.summary.summarized)} summarized, ${formatCount(doc.summary.cached)} cached, ${formatUsd(doc.summary.costUsd)}`,
		);
	}
	const header = [`# ${doc.messages ? "Messages" : doc.title}`, ...meta].join("\n");
	const body = session.exchanges.map((exchange) => renderExchange(exchange, doc.previewChars, doc.messages)).join("\n\n");
	return `${header}\n\n${body}\n`;
}
