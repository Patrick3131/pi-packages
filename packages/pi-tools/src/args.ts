import type { AutocompleteItem } from "@earendil-works/pi-tui";

import { firstLine, type ToolLike } from "./format.js";

export type ToolsCommand =
	| { action: "picker" }
	| { action: "print"; query: string }
	| { action: "unknown"; raw: string };

const PRINT_COMMAND = "print";

export function parseToolsArgs(args: string): ToolsCommand {
	const trimmed = args.trim();
	if (!trimmed) {
		return { action: "picker" };
	}

	const [first, ...rest] = trimmed.split(/\s+/);
	if (first?.toLowerCase() === PRINT_COMMAND) {
		return { action: "print", query: rest.join(" ").trim() };
	}

	return { action: "unknown", raw: trimmed };
}

function normalizeName(value: string): string {
	return value.trim().toLowerCase();
}

function stripTrailingPlural(value: string): string {
	if (value.length > 4 && value.endsWith("s") && !value.endsWith("ss")) {
		return value.slice(0, -1);
	}
	return value;
}

export function matchTools<T extends { name: string }>(tools: T[], query: string): T[] {
	const raw = normalizeName(query);
	if (!raw) {
		return [...tools];
	}

	const stemmed = stripTrailingPlural(raw);
	const exact = tools.filter((tool) => normalizeName(tool.name) === raw);
	if (exact.length > 0) {
		return exact;
	}

	const prefix = tools.filter((tool) => {
		const name = normalizeName(tool.name);
		return name.startsWith(raw) || (stemmed !== raw && name.startsWith(stemmed));
	});
	if (prefix.length > 0) {
		return prefix;
	}

	return tools.filter((tool) => {
		const name = normalizeName(tool.name);
		return name.includes(raw) || name.includes(stemmed) || (stemmed.length >= 4 && raw.startsWith(name));
	});
}

export function getToolsArgumentCompletions(
	argumentPrefix: string,
	tools: ToolLike[],
): AutocompleteItem[] | null {
	const text = argumentPrefix;
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	const first = tokens[0] ?? "";
	const hasTrailingSpace = text.length > 0 && /\s$/.test(text);

	if (tokens.length === 0 || (tokens.length === 1 && !hasTrailingSpace && PRINT_COMMAND.startsWith(first.toLowerCase()))) {
		return [
			{
				value: PRINT_COMMAND,
				label: PRINT_COMMAND,
				description: "Dump tool details into the session (not sent to the model)",
			},
		];
	}

	if (first.toLowerCase() !== PRINT_COMMAND) {
		return null;
	}

	const query = hasTrailingSpace && tokens.length === 1 ? "" : tokens.slice(1).join(" ");
	const matched = matchTools(tools, query);
	if (matched.length === 0) {
		return null;
	}

	return matched.map((tool) => ({
		value: `${PRINT_COMMAND} ${tool.name}`,
		label: tool.name,
		description: firstLine(tool.description) || undefined,
	}));
}
