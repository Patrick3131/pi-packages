/**
 * Pure mention parsing and expansion. No pi API, no I/O beyond the injected
 * `read`, so the whole rewrite is directly testable.
 *
 * Two spellings are accepted, because Pi only understands `/skill:<name>` as
 * the very first token of a message:
 *
 * - `$<name>` anywhere in the message — the primary, autocompleted form
 * - `/skill:<name>` anywhere except position 0, which Pi expands itself
 *
 * Both are rewritten into Pi's own skill block, so the model sees exactly what
 * a `/skill:<name>` command would have produced. Mention the same skill twice
 * and only the first mention is expanded; later ones degrade to the bare name
 * rather than duplicating the whole skill body in context.
 *
 * Strictness differs by spelling, on purpose:
 *
 * - An unresolved `$<name>` is left alone **silently**. Prompts contain shell
 *   text (`$target`, `$files`), and those are not failed skill lookups.
 * - An unresolved `/skill:<name>` is reported, because that spelling is an
 *   explicit request for a skill.
 */

import { stripFrontmatter } from "@earendil-works/pi-coding-agent";

/** A skill the session actually loaded, with everything needed to inline it. */
export interface SkillRef {
	name: string;
	/** Absolute path to `SKILL.md`. */
	filePath: string;
	/** Base directory relative paths inside the skill resolve against. */
	baseDir: string;
}

/** `$` = mention, `command` = the explicit `/skill:` spelling. */
export type MentionForm = "dollar" | "command";

export interface SkillMention {
	name: string;
	form: MentionForm;
	/** Index of the `$` or `/`. */
	start: number;
	/** Index just past the skill name. */
	end: number;
	/** True when the mention was escaped with a backslash and must stay literal. */
	escaped: boolean;
}

export interface MentionProblem {
	name: string;
	form: MentionForm;
	reason: string;
}

export interface ExpansionResult {
	text: string;
	/** Names expanded in this message, in first-mention order. */
	expanded: string[];
	/** Mentions left untouched that are worth telling the user about. */
	problems: MentionProblem[];
}

export interface ExpandOptions {
	text: string;
	skills: ReadonlyMap<string, SkillRef>;
	read: (filePath: string) => string;
}

/**
 * `$<name>` or mid-message `/skill:<name>`, at a token boundary.
 *
 * The lookbehind consumes nothing, so `match.index` is the symbol. Boundaries
 * mirror Pi's own path delimiters plus quotes, so a quoted mention still counts.
 * A backslash is a boundary too, so `\$name` can be recognised as escaped
 * instead of as an unknown token.
 *
 * The leading `[a-z]` is what keeps `$HOME`, `$1` (`$` then a digit), `$(…)` and
 * `${…}` out: none of them can start a skill name.
 */
const MENTION_PATTERN = /(?<=^|[\s"'=\\])(?:\$|\/skill:)([a-z][a-z0-9-]*)/g;

function isEscaped(text: string, index: number): boolean {
	let backslashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
		backslashes += 1;
	}
	return backslashes % 2 === 1;
}

/** The spelling to echo back when nothing is expanded. */
export function formatMention(name: string, form: MentionForm): string {
	return form === "dollar" ? `$${name}` : `/skill:${name}`;
}

/**
 * Every mention in the text, escaped ones included. A leading `/skill:` is
 * skipped: Pi expands it after this extension runs, so expanding it twice would
 * nest skill blocks inside each other.
 */
export function parseSkillMentions(text: string): SkillMention[] {
	const mentions: SkillMention[] = [];
	for (const match of text.matchAll(MENTION_PATTERN)) {
		const start = match.index;
		const form: MentionForm = match[0].startsWith("$") ? "dollar" : "command";
		if (form === "command" && start === 0) {
			continue;
		}
		mentions.push({
			name: match[1],
			form,
			start,
			end: start + match[0].length,
			escaped: isEscaped(text, start),
		});
	}
	return mentions;
}

/** Pi's skill block format, byte-for-byte what `/skill:<name>` produces. */
export function formatSkillBlock(skill: SkillRef, body: string): string {
	return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

export function expandSkillMentions(options: ExpandOptions): ExpansionResult {
	const { text, skills, read } = options;
	const mentions = parseSkillMentions(text);
	if (mentions.length === 0) {
		return { text, expanded: [], problems: [] };
	}

	const expanded: string[] = [];
	const problems: MentionProblem[] = [];
	const seen = new Set<string>();
	let cursor = 0;
	let result = "";

	for (const mention of mentions) {
		// An escaped mention drops its one escaping backslash and stays literal.
		result += text.slice(cursor, mention.escaped ? mention.start - 1 : mention.start);
		cursor = mention.end;

		const literal = text.slice(mention.start, mention.end);
		if (mention.escaped) {
			result += literal;
			continue;
		}

		const { name, form } = mention;
		const skill = skills.get(name);
		if (skill === undefined) {
			if (form === "command") {
				problems.push({ name, form, reason: "not loaded in this session" });
			}
			result += literal;
			continue;
		}

		if (seen.has(name)) {
			result += name;
			continue;
		}

		let body: string;
		try {
			body = stripFrontmatter(read(skill.filePath)).trim();
		} catch (error) {
			problems.push({
				name,
				form,
				reason: error instanceof Error ? error.message : String(error),
			});
			result += literal;
			continue;
		}

		seen.add(name);
		expanded.push(name);
		result += formatSkillBlock(skill, body);
	}

	return { text: result + text.slice(cursor), expanded, problems };
}
