import { escapeHtml } from "./escape.js";
import { truncateAtLine } from "./text.js";

/**
 * Small dependency-free Markdown subset for recap rendering.
 *
 * The source text is untrusted: it is escaped before any tag is generated, link
 * targets are scheme-checked, and no raw HTML from the session can pass through.
 */

const PLACEHOLDER = "\u0001";
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/u;
const FENCE_OPEN = /^\s*(```+|~~~+)\s*([^\s`]*)\s*$/u;
const HR = /^\s*([-*_])\s*(?:\1\s*){2,}$/u;

function stashPush(stash: string[], html: string): string {
	stash.push(html);
	return `${PLACEHOLDER}${stash.length - 1}${PLACEHOLDER}`;
}

function sanitizeUrl(url: string): string | null {
	const trimmed = url.trim();
	if (trimmed.startsWith("#")) return trimmed;
	if (/^(?:https?|mailto):/iu.test(trimmed)) return trimmed;
	return null;
}

function restorePlaceholders(html: string, stash: string[]): string {
	return html.replace(/\u0001(\d+)\u0001/gu, (_match, index: string) => stash[Number(index)] ?? "");
}

export function renderInline(raw: string): string {
	const stash: string[] = [];

	// Inline code spans from the raw text, before any escaping or formatting.
	let text = raw.replace(/`([^`\n]+)`/gu, (_match, code: string) => stashPush(stash, `<code>${escapeHtml(code)}</code>`));

	// Explicit autolinks: <https://example.com>
	text = text.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gu, (match, url: string) => {
		const safe = sanitizeUrl(url);
		if (!safe) return match;
		return stashPush(stash, `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`);
	});

	// Backslash escapes keep the following character literal.
	text = text.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/gu, (_match, char: string) => stashPush(stash, escapeHtml(char)));

	let html = escapeHtml(text);

	// Links: [label](url). Unsafe or unknown schemes degrade to the bare label.
	html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/gu, (_match, label: string, url: string) => {
		const safe = sanitizeUrl(url);
		if (!safe) return label;
		return stashPush(stash, `<a href="${safe}" target="_blank" rel="noreferrer">${label}</a>`);
	});

	html = html.replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>");
	html = html.replace(/__([^_]+)__/gu, "<strong>$1</strong>");
	html = html.replace(/(^|[^*])\*([^*\n]+)\*/gu, "$1<em>$2</em>");
	html = html.replace(/(^|[^_\w])_([^_\n]+)_/gu, "$1<em>$2</em>");
	html = html.replace(/~~([^~]+)~~/gu, "<del>$1</del>");

	return restorePlaceholders(html, stash);
}

function renderFence(
	lines: string[],
	start: number,
	markerToken: string,
	language: string,
): { html: string; index: number } {
	const marker = markerToken[0];
	const minimum = markerToken.length;
	const close = new RegExp(`^\\s*${marker}{${minimum},}\\s*$`, "u");
	const code: string[] = [];
	let index = start + 1;
	while (index < lines.length && !close.test(lines[index])) {
		code.push(lines[index]);
		index++;
	}
	if (index < lines.length) index++;
	const languageClass = /^[A-Za-z0-9_+-]+$/u.test(language) ? ` class="language-${escapeHtml(language)}"` : "";
	return { html: `<pre class="code"><code${languageClass}>${escapeHtml(code.join("\n"))}</code></pre>`, index };
}

function splitRow(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/u, "")
		.replace(/\|$/u, "")
		.split("|")
		.map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
	const cells = splitRow(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/u.test(cell));
}

function renderTable(lines: string[], start: number): { html: string; index: number } {
	const header = splitRow(lines[start]);
	const rows: string[][] = [];
	let index = start + 2;
	while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
		rows.push(splitRow(lines[index]));
		index++;
	}
	const head = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`;
	const body = rows.length
		? `<tbody>${rows
				.map((row) => `<tr>${header.map((_cell, column) => `<td>${renderInline(row[column] ?? "")}</td>`).join("")}</tr>`)
				.join("")}</tbody>`
		: "";
	return { html: `<div class="table-wrap"><table>${head}${body}</table></div>`, index };
}

function renderList(lines: string[], start: number, baseIndent: number): { html: string; index: number } {
	const first = LIST_ITEM.exec(lines[start]);
	const ordered = Boolean(first && /\d+\./u.test(first[2]));
	const items: { content: string; children: string }[] = [];
	let index = start;

	while (index < lines.length) {
		const match = LIST_ITEM.exec(lines[index]);
		if (!match) break;
		const indent = match[1].length;
		if (indent < baseIndent) break;
		if (indent > baseIndent) {
			const nested = renderList(lines, index, indent);
			if (items.length > 0) items[items.length - 1].children += nested.html;
			else items.push({ content: "", children: nested.html });
			index = nested.index;
			continue;
		}

		const item = { content: match[3], children: "" };
		index++;
		while (index < lines.length) {
			const next = lines[index];
			if (!next.trim()) break;
			const nextItem = LIST_ITEM.exec(next);
			if (nextItem) break;
			if (/^\s*(?:```|~~~|#{1,6}\s|\||>)/u.test(next)) break;
			item.content += `\n${next.trim()}`;
			index++;
		}
		items.push(item);
	}

	const tag = ordered ? "ol" : "ul";
	const html = items.map((item) => `<li>${renderInline(item.content)}${item.children}</li>`).join("");
	return { html: `<${tag}>${html}</${tag}>`, index };
}

function renderBlockquote(lines: string[], start: number): { html: string; index: number } {
	const quote: string[] = [];
	let index = start;
	while (index < lines.length && /^\s{0,3}>/u.test(lines[index])) {
		quote.push(lines[index].replace(/^\s{0,3}>\s?/u, ""));
		index++;
	}
	return { html: `<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`, index };
}

function isBlockStart(lines: string[], index: number): boolean {
	const line = lines[index];
	if (FENCE_OPEN.test(line)) return true;
	if (/^#{1,6}\s+/u.test(line)) return true;
	if (HR.test(line)) return true;
	if (/^\s{0,3}>/u.test(line)) return true;
	if (LIST_ITEM.test(line)) return true;
	if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) return true;
	return false;
}

function renderParagraph(lines: string[], start: number): { html: string; index: number } {
	const paragraph: string[] = [];
	let index = start;
	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) break;
		if (paragraph.length > 0 && isBlockStart(lines, index)) break;
		paragraph.push(line.trim());
		index++;
	}
	return { html: `<p>${renderInline(paragraph.join("\n"))}</p>`, index };
}

export function renderMarkdown(source: string): string {
	const lines = source.replace(/\r\n?/gu, "\n").split("\n");
	const blocks: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index++;
			continue;
		}

		const fence = FENCE_OPEN.exec(line);
		if (fence) {
			const next = renderFence(lines, index, fence[1], fence[2]);
			blocks.push(next.html);
			index = next.index;
			continue;
		}

		const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/u.exec(line);
		if (heading) {
			const level = Math.min(heading[1].length + 2, 6);
			blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
			index++;
			continue;
		}

		if (HR.test(line)) {
			blocks.push("<hr>");
			index++;
			continue;
		}

		if (/^\s{0,3}>/u.test(line)) {
			const next = renderBlockquote(lines, index);
			blocks.push(next.html);
			index = next.index;
			continue;
		}

		if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
			const next = renderTable(lines, index);
			blocks.push(next.html);
			index = next.index;
			continue;
		}

		if (LIST_ITEM.test(line)) {
			const next = renderList(lines, index, LIST_ITEM.exec(line)![1].length);
			blocks.push(next.html);
			index = next.index;
			continue;
		}

		const next = renderParagraph(lines, index);
		blocks.push(next.html);
		index = next.index;
	}

	return blocks.join("\n");
}

export interface MarkdownSplit {
	head: string;
	tail: string;
	truncated: boolean;
}

/** Split markdown at a blank-line boundary outside fences so both halves render standalone. */
export function splitMarkdown(source: string, maxChars: number): MarkdownSplit {
	if (source.length <= maxChars) return { head: source, tail: "", truncated: false };

	const lines = source.split("\n");
	const safePoints: number[] = [];
	let inFence = false;
	let fenceChar = "";
	let offset = 0;

	for (const line of lines) {
		offset += line.length + 1;
		const fence = /^\s*(```+|~~~+)/u.exec(line);
		if (fence) {
			if (!inFence) {
				inFence = true;
				fenceChar = fence[1][0];
			} else if (line.trim().startsWith(fenceChar.repeat(3))) {
				inFence = false;
				safePoints.push(Math.min(offset, source.length));
			}
			continue;
		}
		if (inFence) continue;
		if (!line.trim()) safePoints.push(Math.min(offset, source.length));
	}

	let headEnd = -1;
	for (const point of safePoints) {
		if (point <= maxChars) headEnd = point;
	}
	if (headEnd <= 0) headEnd = safePoints.find((point) => point > maxChars) ?? -1;

	if (headEnd <= 0) {
		const fallback = truncateAtLine(source, maxChars);
		return { head: fallback.head.trim(), tail: fallback.tail.trim(), truncated: true };
	}

	return { head: source.slice(0, headEnd).trim(), tail: source.slice(headEnd).trim(), truncated: true };
}
