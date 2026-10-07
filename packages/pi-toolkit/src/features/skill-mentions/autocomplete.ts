/**
 * Pure autocomplete logic for `$<name>` skill mentions.
 *
 * `$` is registered as a trigger character, so the editor asks for suggestions
 * the moment it is typed at a token boundary — no extra letter needed, unlike
 * the built-in `@` attachment token.
 *
 * No pi or TUI imports: the item shape is structurally `AutocompleteItem`.
 */

export interface SuggestionItem {
	value: string;
	label: string;
	description?: string;
}

export interface SuggestionSkill {
	name: string;
	description?: string;
}

/** `$<fragment>` at a token boundary before the cursor. */
const DOLLAR_TOKEN = /(?<=^|[\s"'=])\$([a-z][a-z0-9-]*)?$/;

/**
 * `/skill:<fragment>` mid-message. Requires a preceding space, so a leading
 * `/skill:` keeps the built-in slash-command completion.
 */
const SLASH_TOKEN = /(?<=\s)\/skill:([a-z][a-z0-9-]*)?$/;

const DOLLAR_LEAD = "$";
const SLASH_LEAD = "/skill:";

const MAX_ITEMS = 30;
const MAX_DESCRIPTION = 90;

/** The mention token directly before the cursor, or `undefined`. */
export function mentionTokenBeforeCursor(textBeforeCursor: string): string | undefined {
	const dollar = textBeforeCursor.match(DOLLAR_TOKEN);
	if (dollar) {
		return `${DOLLAR_LEAD}${dollar[1] ?? ""}`;
	}
	const slash = textBeforeCursor.match(SLASH_TOKEN);
	return slash ? `${SLASH_LEAD}${slash[1] ?? ""}` : undefined;
}

/** True for a token this provider owns, so completion can be applied locally. */
export function isMentionToken(token: string): boolean {
	return /^\$[a-z0-9-]*$/.test(token) || /^\/skill:[a-z0-9-]*$/.test(token);
}

/** The typed part after the symbol, empty for a bare `$`. */
export function mentionFragment(token: string): string {
	return token.startsWith(DOLLAR_LEAD) ? token.slice(DOLLAR_LEAD.length) : token.slice(SLASH_LEAD.length);
}

/** The spelling to re-emit, so completion keeps the form the user typed. */
function mentionLead(token: string): string {
	return token.startsWith(DOLLAR_LEAD) ? DOLLAR_LEAD : SLASH_LEAD;
}

function truncate(text: string, max: number): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

/** Name matches that start with the fragment rank above mid-name matches. */
function rankSkills(skills: readonly SuggestionSkill[], fragment: string): SuggestionSkill[] {
	const query = fragment.toLowerCase();
	const matches = query === "" ? [...skills] : skills.filter((skill) => skill.name.toLowerCase().includes(query));
	return matches.sort((left, right) => {
		const leftPrefix = left.name.toLowerCase().startsWith(query) ? 0 : 1;
		const rightPrefix = right.name.toLowerCase().startsWith(query) ? 0 : 1;
		return leftPrefix - rightPrefix || left.name.localeCompare(right.name);
	});
}

/**
 * Suggestions for a mention token. An empty list means the fragment names no
 * loaded skill, which the caller reports as "not ours" so that other providers
 * (`$` completions from other extensions) still get a chance.
 */
export function skillSuggestionItems(options: {
	token: string;
	skills: readonly SuggestionSkill[];
	max?: number;
}): SuggestionItem[] {
	const lead = mentionLead(options.token);
	const fragment = mentionFragment(options.token);
	return rankSkills(options.skills, fragment)
		.slice(0, options.max ?? MAX_ITEMS)
		.map((skill) => ({
			value: `${lead}${skill.name}`,
			label: `${lead}${skill.name}`,
			description: skill.description ? truncate(skill.description, MAX_DESCRIPTION) : undefined,
		}));
}

/**
 * Replace the mention token with the chosen item, leaving the surrounding text
 * and the cursor position untouched. No trailing space: mentions sit inside
 * sentences.
 */
export function applyMentionCompletion(options: {
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
