export interface TruncatedText {
	head: string;
	tail: string;
	truncated: boolean;
}

/** Split text into a visible head and a remainder at a line, then word, boundary. */
export function truncateAtLine(text: string, maxChars: number): TruncatedText {
	if (text.length <= maxChars) return { head: text, tail: "", truncated: false };
	if (maxChars <= 0) return { head: "", tail: text, truncated: true };
	let cut = text.lastIndexOf("\n", maxChars);
	if (cut <= 0) cut = text.lastIndexOf(" ", maxChars);
	if (cut <= 0) cut = maxChars;
	return { head: text.slice(0, cut), tail: text.slice(cut), truncated: true };
}

/** First non-empty line, whitespace-collapsed and ellipsized for navigation labels. */
export function firstLine(text: string, maxChars = 80): string {
	const line = text
		.split("\n")
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	if (!line) return "";
	const collapsed = line.replace(/\s+/g, " ");
	if (collapsed.length <= maxChars) return collapsed;
	return `${collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** Human-readable token/count formatting for the recap header. */
export function formatCount(value: number): string {
	return new Intl.NumberFormat("en-US").format(value);
}

export function formatUsd(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "$0.00";
	if (value < 0.01) return `$${value.toFixed(4)}`;
	return `$${value.toFixed(2)}`;
}

export function formatTimestamp(value?: string): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}
