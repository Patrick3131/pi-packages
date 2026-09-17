/**
 * Reference several skills from anywhere in one message.
 *
 * Pi expands `/skill:<name>` only as the first token of a message, so a message
 * can carry at most one skill and only at the front. This extension rewrites
 * `$<name>` (and a non-leading `/skill:<name>`) into Pi's own skill block
 * format, any number of times, wherever it appears.
 *
 * It also completes those mentions: typing `$` at a token boundary offers every
 * loaded skill.
 *
 * The `input` event fires before Pi's own skill expansion, so a leading
 * `/skill:<name>` is left alone and expanded by Pi afterwards.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	applyMentionCompletion,
	isMentionToken,
	mentionTokenBeforeCursor,
	skillSuggestionItems,
} from "./autocomplete.js";
import { expandSkillMentions, formatMention, type MentionProblem, type SkillRef } from "./mentions.js";

/** Cheap gate before touching the skill index. */
const MENTION_HINT = "$";

/** Cap the "available skills" list so a warning stays readable. */
const MAX_LISTED_SKILLS = 8;

/** Cap the `/skill-mentions` listing. */
const MAX_COMMAND_SKILLS = 40;

interface LoadedSkill extends SkillRef {
	description?: string;
}

/**
 * Skills the session loaded, keyed by bare name. Read live from Pi's command
 * list so a `/reload` or a newly trusted project needs no extra bookkeeping.
 */
function loadedSkills(pi: ExtensionAPI): Map<string, LoadedSkill> {
	const skills = new Map<string, LoadedSkill>();
	for (const command of pi.getCommands()) {
		if (command.source !== "skill") {
			continue;
		}
		const name = command.name.startsWith("skill:") ? command.name.slice("skill:".length) : command.name;
		const filePath = command.sourceInfo.path;
		skills.set(name, {
			name,
			filePath,
			baseDir: command.sourceInfo.baseDir ?? dirname(filePath),
			description: command.description,
		});
	}
	return skills;
}

/** Only mention text is worth inspecting; `$` alone is the common case. */
function mayContainMention(text: string): boolean {
	return text.includes(MENTION_HINT) || text.includes("skill:");
}

function reportProblems(ctx: ExtensionContext, problems: MentionProblem[], skills: Map<string, LoadedSkill>): void {
	const names = [...skills.keys()].sort();
	const listed = names.slice(0, MAX_LISTED_SKILLS).join(", ");
	const more = names.length > MAX_LISTED_SKILLS ? `, +${names.length - MAX_LISTED_SKILLS} more` : "";
	const detail = problems.map((problem) => `${formatMention(problem.name, problem.form)} (${problem.reason})`).join(", ");
	ctx.ui.notify(`Could not expand ${detail}. Loaded skills: ${listed || "none"}${more}.`, "warning");
}

export default function skillMentionsExtension(pi: ExtensionAPI) {
	pi.on("input", (event, ctx) => {
		// Messages injected by extensions are already formatted by their sender.
		if (event.source === "extension" || !mayContainMention(event.text)) {
			return { action: "continue" };
		}

		const skills = loadedSkills(pi);
		const result = expandSkillMentions({
			text: event.text,
			skills,
			read: (filePath) => readFileSync(filePath, "utf8"),
		});

		if (result.problems.length > 0) {
			reportProblems(ctx, result.problems, skills);
		}
		if (result.expanded.length === 0) {
			return { action: "continue" };
		}
		return { action: "transform", text: result.text };
	});

	// Stacked on the built-in provider, which owns `@path` attachments.
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			// `$` is not a built-in trigger, and the editor fires trigger
			// characters immediately, so bare `$` lists every skill at once.
			triggerCharacters: ["$"],

			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const token = mentionTokenBeforeCursor((lines[cursorLine] ?? "").slice(0, cursorCol));
				if (token === undefined) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}
				const items = skillSuggestionItems({ token, skills: [...loadedSkills(pi).values()] });
				if (items.length === 0) {
					// No skill matches, so the token is not ours: another provider
					// may still own `$…` (or the built-in may own an `@skill:` path).
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}
				return { prefix: token, items };
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				if (isMentionToken(prefix)) {
					return applyMentionCompletion({ lines, cursorLine, cursorCol, value: item.value, prefix });
				}
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});

	pi.registerCommand("skill-mentions", {
		description: "List the skills $<name> can load",
		handler: async (_args, ctx) => {
			const skills = [...loadedSkills(pi).values()].sort((left, right) => left.name.localeCompare(right.name));
			if (skills.length === 0) {
				ctx.ui.notify("No skills are loaded in this session.", "info");
				return;
			}
			const items = skillSuggestionItems({ token: "$", skills, max: MAX_COMMAND_SKILLS });
			const lines = items.map((item) => (item.description ? `• ${item.label} — ${item.description}` : `• ${item.label}`));
			const more = skills.length > items.length ? `\n+${skills.length - items.length} more` : "";
			ctx.ui.notify(`${skills.length} skill(s) available:\n${lines.join("\n")}${more}`, "info");
		},
	});
}
