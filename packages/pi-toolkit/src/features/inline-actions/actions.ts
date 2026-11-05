/**
 * Inline actions: change the model, thinking level, tool set, or preset from
 * anywhere in a message, using a `$` directive that never reaches the model.
 *
 * Grammar — one token, no spaces, colon required:
 *
 *   $model:<provider/model | model-id>
 *   $thinking:<level>
 *   $tools:<+name,-name,...>
 *   $preset:<name>
 *
 * The colon is what makes a directive unambiguous. A bare `$model` stays an
 * ordinary mention token, so prose and shell text (`$model`, `$files`,
 * `$HOME`) are never rewritten, and an action never shadows a skill that
 * happens to share its name. A directive with no argument (`$model:`) opens a
 * picker instead.
 *
 * Pure module: no pi API, no TUI value imports, no I/O. Every branch is unit
 * testable and this feature stays removable on its own.
 */

/** Actions, in menu order. */
export const ACTIONS = [
	{ name: "model", description: "Switch the model for this session", placeholder: "provider/model" },
	{ name: "thinking", description: "Set the thinking level", placeholder: "level" },
	{ name: "tools", description: "Enable or disable tools", placeholder: "+name,-name" },
	{ name: "preset", description: "Apply a preset", placeholder: "name" },
] as const;

export type ActionName = (typeof ACTIONS)[number]["name"];

/** Pi's levels. Mirrors the presets feature rather than importing a runtime value. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Structurally `AutocompleteItem`, so this module needs no TUI dependency. */
export interface SuggestionItem {
	value: string;
	label: string;
	description?: string;
}

const ACTION_NAMES = ACTIONS.map((action) => action.name);
const MAX_ITEMS = 30;
const MAX_DESCRIPTION = 90;

/** Token boundaries, matching the skill-mentions parser so both agree. */
const BOUNDARY = "(?<=^|[\\s\"'=\\\\])";
/** Directive arg: no whitespace, and it never ends in prose punctuation. */
const ARG_BODY = "[A-Za-z0-9._/@+,-]*";
const ARG_TAIL = "[A-Za-z0-9_/@+-]";

/** `$<fragment>` or `$<action>:<arg-fragment>` directly before the cursor. */
const TOKEN_BEFORE_CURSOR = new RegExp(
	`${BOUNDARY}\\$(?:([a-z][a-z0-9-]*)(?::([A-Za-z0-9._/@+,-]*))?)?$`,
);

/** A complete directive in the message text. */
const DIRECTIVE = new RegExp(
	`${BOUNDARY}\\$(${ACTION_NAMES.join("|")}):(?:${ARG_BODY}${ARG_TAIL}|)`,
	"g",
);

export interface CursorToken {
	/** The name fragment, e.g. `mod` for `$mod`. */
	fragment: string;
	/** Argument fragment; `undefined` for the bare form, `""` for `$model:`. */
	arg?: string;
	/** Exact text before the cursor to replace on completion. */
	token: string;
}

export interface Directive {
	name: ActionName;
	arg: string;
	start: number;
	/** Index just past the directive, excluding prose punctuation. */
	end: number;
	/** True when escaped with a backslash; the caller must leave it alone. */
	escaped: boolean;
}

export interface ToolChange {
	sign: "+" | "-";
	name: string;
}

export interface ActionSources {
	models: readonly { provider: string; id: string }[];
	tools: readonly { name: string; description?: string; active?: boolean }[];
	presets: readonly string[];
}

function isEscaped(text: string, index: number): boolean {
	let backslashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
		backslashes += 1;
	}
	return backslashes % 2 === 1;
}

function truncate(text: string, max: number): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

export function isActionName(value: string): value is ActionName {
	return (ACTION_NAMES as readonly string[]).includes(value);
}

/** True for a fully qualified directive value, e.g. `$model:`. */
export function isActionValue(value: string): boolean {
	return new RegExp(`^\\$(${ACTION_NAMES.join("|")}):`).test(value);
}

/** The `$` token directly before the cursor, when this feature should answer for it. */
export function actionTokenBeforeCursor(textBeforeCursor: string): CursorToken | undefined {
	const match = textBeforeCursor.match(TOKEN_BEFORE_CURSOR);
	if (!match) {
		return undefined;
	}
	const fragment = match[1] ?? "";
	const arg = match[2];
	return { fragment, arg, token: arg === undefined ? `$${fragment}` : `$${fragment}:${arg}` };
}

/** Every complete directive in the text, escaped ones included. */
export function parseDirectives(text: string): Directive[] {
	const directives: Directive[] = [];
	for (const match of text.matchAll(DIRECTIVE)) {
		const start = match.index;
		const name = match[1];
		if (!isActionName(name)) {
			continue;
		}
		// `$` + name + `:` precede the argument.
		const argOffset = name.length + 2;
		directives.push({
			name,
			arg: match[0].slice(argOffset),
			start,
			end: start + match[0].length,
			escaped: isEscaped(text, start),
		});
	}
	return directives;
}

/**
 * Rewrite directives out of the text, preserving every other byte.
 *
 * An active directive is removed entirely. An escaped one loses only its
 * escaping backslash and stays literal, so `\$model:x` reads as `$model:x`
 * without switching the model.
 */
export function rewriteDirectives(text: string, directives: readonly Directive[]): string {
	let cursor = 0;
	let result = "";
	for (const directive of directives) {
		result += text.slice(cursor, directive.escaped ? directive.start - 1 : directive.start);
		if (directive.escaped) {
			result += text.slice(directive.start, directive.end);
		}
		cursor = directive.end;
	}
	return result + text.slice(cursor);
}

/** `+name,-name,name` → ordered changes; an unmarked name means "enable". */
export function parseToolChanges(arg: string): ToolChange[] {
	const changes: ToolChange[] = [];
	for (const segment of arg.split(",")) {
		const trimmed = segment.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const sign = trimmed.startsWith("-") ? "-" : "+";
		const name = sign === "-" ? trimmed.slice(1) : trimmed.replace(/^\+/, "");
		if (name.length > 0) {
			changes.push({ sign, name });
		}
	}
	return changes;
}

export function formatToolChanges(changes: readonly ToolChange[]): string {
	return changes.map((change) => `${change.sign}${change.name}`).join(" ");
}

/** Action names for the shared `$` menu, ranked by a name-prefix match. */
export function actionSuggestionItems(fragment: string): SuggestionItem[] {
	const query = fragment.toLowerCase();
	const matches = ACTIONS.filter((action) => query === "" || action.name.startsWith(query));
	return matches.map((action) => ({
		value: `$${action.name}:`,
		label: `$${action.name}:`,
		description: truncate(`${action.description} — ${action.placeholder}`, MAX_DESCRIPTION),
	}));
}

/**
 * Argument suggestions for the action in `token`.
 *
 * Every item's `value` is the complete replacement token, because completion
 * replaces the whole `$…` token in place. `$tools:` builds a comma list, so
 * only the last segment is edited and the earlier ones are carried over.
 */
export function actionArgSuggestionItems(token: CursorToken, sources: ActionSources): SuggestionItem[] {
	if (token.arg === undefined || !isActionName(token.fragment)) {
		return [];
	}
	switch (token.fragment) {
		case "model":
			return modelItems(token, sources);
		case "thinking":
			return thinkingItems(token);
		case "tools":
			return toolItems(token, sources);
		case "preset":
			return presetItems(token, sources);
	}
}

function modelItems(token: CursorToken, sources: ActionSources): SuggestionItem[] {
	const query = (token.arg ?? "").toLowerCase();
	return sources.models
		.map((model) => ({ label: `${model.provider}/${model.id}`, model }))
		.filter(({ label }) => query === "" || label.toLowerCase().includes(query))
		.slice(0, MAX_ITEMS)
		.map(({ label }) => ({ value: `$model:${label}`, label }));
}

function thinkingItems(token: CursorToken): SuggestionItem[] {
	const query = (token.arg ?? "").toLowerCase();
	return THINKING_LEVELS.filter((level) => query === "" || level.startsWith(query)).map((level) => ({
		value: `$thinking:${level}`,
		label: level,
	}));
}

function presetItems(token: CursorToken, sources: ActionSources): SuggestionItem[] {
	const query = (token.arg ?? "").toLowerCase();
	return [...sources.presets]
		.filter((name) => query === "" || name.toLowerCase().includes(query))
		.slice(0, MAX_ITEMS)
		.map((name) => ({ value: `$preset:${name}`, label: name }));
}

function toolItems(token: CursorToken, sources: ActionSources): SuggestionItem[] {
	const segments = (token.arg ?? "").split(",");
	const current = segments.pop() ?? "";
	const sign: ToolChange["sign"] = current.startsWith("-") ? "-" : "+";
	const query = current.replace(/^[+-]/, "").toLowerCase();

	return sources.tools
		.filter((tool) => (sign === "-" ? tool.active === true : true))
		.filter((tool) => query === "" || tool.name.toLowerCase().includes(query))
		.sort((left, right) => left.name.localeCompare(right.name))
		.slice(0, MAX_ITEMS)
		.map((tool) => ({
			value: `$tools:${[...segments, `${sign}${tool.name}`].join(",")}`,
			label: `${sign}${tool.name}`,
			description: tool.description ? truncate(tool.description, MAX_DESCRIPTION) : undefined,
		}));
}

/** Replace the token before the cursor, leaving the rest of the line untouched. */
export function applyTokenCompletion(options: {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
	value: string;
	prefix: string;
}): { lines: string[]; cursorLine: number; cursorCol: number } {
	const { lines, cursorLine, cursorCol, value, prefix } = options;
	const currentLine = lines[cursorLine] ?? "";
	const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
	const afterCursor = currentLine.slice(cursorCol);
	const newLines = [...lines];
	newLines[cursorLine] = `${beforePrefix}${value}${afterCursor}`;
	return { lines: newLines, cursorLine, cursorCol: beforePrefix.length + value.length };
}
