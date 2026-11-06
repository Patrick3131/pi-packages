/**
 * `$` directives that change session state instead of adding context.
 *
 * `$model:<id>`, `$thinking:<level>`, `$tools:+name,-name`, `$preset:<name>`
 * are applied by the `input` handler before the run starts, then stripped from
 * the message, so the model never sees them and the user never loses the draft
 * they were typing. A directive with no argument opens a picker.
 *
 * This feature also stacks onto the `$` autocomplete list, so one popup offers
 * the action names first and then whatever the stacked provider (skill mentions,
 * then Pi's built-in) would have shown.
 *
 * Deliberately no slash command: the built-in interactive commands cannot be
 * dispatched from an extension, and the `input` event is the only place that
 * can act before a turn with the editor draft intact.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

import { searchablePicker } from "../../shared/searchable-picker.js";
import { getPresetRuntime } from "../presets/registry.js";
import {
	type ActionName,
	type ActionSources,
	THINKING_LEVELS,
	type ThinkingLevel,
	actionArgSuggestionItems,
	actionSuggestionItems,
	actionTokenBeforeCursor,
	applyTokenCompletion,
	bareActionName,
	formatToolChanges,
	isActionName,
	isActionValue,
	parseDirectives,
	parseToolChanges,
	rewriteDirectives,
} from "./actions.js";

/**
 * `$` is not a Pi built-in; skill mentions register it too, and lists merge.
 * `:` is what turns a bare action into an argument list, so it opens the menu a
 * keystroke earlier for a directive typed by hand.
 */
const TRIGGER_CHARACTERS = ["$", ":"];

interface Environment {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	/** Idle and dialog-capable: a directive may open a picker. */
	interactive: boolean;
}

interface Outcome {
	applied?: string;
	problem?: string;
}

function availableModels(ctx: ExtensionContext): Model<Api>[] {
	return ctx.scopedModels.length > 0
		? ctx.scopedModels.map((scoped) => scoped.model)
		: ctx.modelRegistry.getAvailable();
}

/** `provider/id` first, then a bare id, so the picker's labels round-trip. */
function findModel(ctx: ExtensionContext, requested: string): Model<Api> | undefined {
	const separator = requested.indexOf("/");
	if (separator > 0) {
		const found = ctx.modelRegistry.find(requested.slice(0, separator), requested.slice(separator + 1));
		if (found) {
			return found;
		}
	}
	return availableModels(ctx).find(
		(model) => model.id === requested || `${model.provider}/${model.id}` === requested,
	);
}

function isThinkingLevel(value: string): value is ThinkingLevel {
	return (THINKING_LEVELS as readonly string[]).includes(value);
}

async function applyModel(env: Environment, arg: string): Promise<Outcome> {
	let requested = arg.trim();
	if (requested.length === 0) {
		if (!env.interactive) {
			return { problem: "$model: needs a model id" };
		}
		const models = availableModels(env.ctx);
		if (models.length === 0) {
			return { problem: "no models are available" };
		}
		const current = env.ctx.model;
		requested =
			(await searchablePicker(env.ctx, {
				title: "Model for this session",
				items: models.map((model) => ({
					value: `${model.provider}/${model.id}`,
					label: `${model.provider}/${model.id}`,
					description: model.name && model.name !== model.id ? model.name : undefined,
					current: current?.provider === model.provider && current.id === model.id,
				})),
			})) ?? "";
		if (requested.length === 0) {
			return { problem: "$model: cancelled" };
		}
	}

	const model = findModel(env.ctx, requested);
	if (!model) {
		return { problem: `unknown model "${requested}"` };
	}
	if (!(await env.pi.setModel(model))) {
		return { problem: `no credentials for ${model.provider}/${model.id}` };
	}
	return { applied: `model → ${model.provider}/${model.id}` };
}

async function applyThinking(env: Environment, arg: string): Promise<Outcome> {
	let requested = arg.trim();
	if (requested.length === 0) {
		if (!env.interactive) {
			return { problem: `$thinking: needs a level (${THINKING_LEVELS.join(", ")})` };
		}
		requested =
			(await searchablePicker(env.ctx, {
				title: "Thinking level",
				maxVisible: THINKING_LEVELS.length,
				items: THINKING_LEVELS.map((level) => ({
					value: level,
					label: level,
					current: env.ctx.thinkingLevel === level,
				})),
			})) ?? "";
		if (requested.length === 0) {
			return { problem: "$thinking: cancelled" };
		}
	}

	if (!isThinkingLevel(requested)) {
		return { problem: `unknown thinking level "${requested}" (${THINKING_LEVELS.join(", ")})` };
	}
	env.pi.setThinkingLevel(requested);
	return { applied: `thinking → ${requested}` };
}

async function applyTools(env: Environment, arg: string): Promise<Outcome> {
	const known = env.pi.getAllTools().map((tool) => tool.name);
	let changes = parseToolChanges(arg);

	if (changes.length === 0) {
		if (!env.interactive) {
			return { problem: "$tools: needs +name or -name" };
		}
		if (known.length === 0) {
			return { problem: "no tools are available" };
		}
		const active = new Set(env.pi.getActiveTools());
		const tools = [...known].sort((left, right) => left.localeCompare(right));
		const chosen = await searchablePicker(env.ctx, {
			title: "Toggle tool",
			subtitle: "Enter or Space toggles the highlighted tool",
			items: tools.map((name) => ({ value: name, label: name, current: active.has(name) })),
		});
		if (chosen === undefined) {
			return { problem: "$tools: cancelled" };
		}
		changes = [{ sign: active.has(chosen) ? "-" : "+", name: chosen }];
	}

	const unknown = changes.filter((change) => !known.includes(change.name));
	if (unknown.length > 0) {
		return { problem: `unknown tool${unknown.length > 1 ? "s" : ""}: ${unknown.map((change) => change.name).join(", ")}` };
	}

	const next = new Set(env.pi.getActiveTools());
	for (const change of changes) {
		if (change.sign === "+") {
			next.add(change.name);
		} else {
			next.delete(change.name);
		}
	}
	// Keep Pi's existing order, then append newly enabled tools in request order.
	const ordered = env.pi.getActiveTools().filter((name) => next.has(name));
	for (const name of next) {
		if (!ordered.includes(name)) {
			ordered.push(name);
		}
	}
	env.pi.setActiveTools(ordered);
	return { applied: `tools ${formatToolChanges(changes)}` };
}

async function applyPreset(env: Environment, arg: string): Promise<Outcome> {
	const runtime = getPresetRuntime();
	if (!runtime) {
		return { problem: "the presets feature is not loaded" };
	}
	const available = runtime.names();
	if (available.length === 0) {
		return { problem: "no presets are defined" };
	}

	let requested = arg.trim();
	if (requested.length === 0) {
		if (!env.interactive) {
			return { problem: "$preset: needs a preset name" };
		}
		requested =
			(await searchablePicker(env.ctx, {
				title: "Apply preset",
				items: available.map((name) => ({ value: name, label: name })),
			})) ?? "";
		if (requested.length === 0) {
			return { problem: "$preset: cancelled" };
		}
	}

	if (!available.includes(requested)) {
		return { problem: `unknown preset "${requested}" (available: ${available.join(", ")})` };
	}
	const applied = await runtime.apply(requested, env.ctx);
	return applied ? { applied: `preset → ${requested}` } : { problem: `preset "${requested}" could not be applied` };
}

async function applyDirective(env: Environment, name: ActionName, arg: string): Promise<Outcome> {
	switch (name) {
		case "model":
			return applyModel(env, arg);
		case "thinking":
			return applyThinking(env, arg);
		case "tools":
			return applyTools(env, arg);
		case "preset":
			return applyPreset(env, arg);
	}
}

/**
 * The editor closes its list when an item is chosen and only asks again on the
 * next keystroke, so a bare action (`$model:`) gets its argument from a dialog:
 * pick the action, the picker opens over the draft, the choice applies at once.
 */
function openArgumentPicker(pi: ExtensionAPI, ctx: ExtensionContext, name: ActionName): void {
	// After the editor has finished applying the completion and settled its state.
	queueMicrotask(() => {
		void (async () => {
			try {
				const outcome = await applyDirective({ pi, ctx, interactive: true }, name, "");
				if (outcome.problem !== undefined) {
					ctx.ui.notify(outcome.problem, "warning");
				}
				if (outcome.applied !== undefined) {
					ctx.ui.notify(outcome.applied, "info");
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`$${name}: ${reason}`, "warning");
			}
		})();
	});
}

/** Live data for the argument lists; the model registry comes from the session. */
function collectSources(pi: ExtensionAPI, ctx: ExtensionContext | undefined): ActionSources {
	const active = new Set(pi.getActiveTools());
	return {
		models: ctx ? availableModels(ctx).map((model) => ({ provider: model.provider, id: model.id })) : [],
		tools: pi.getAllTools().map((tool) => ({
			name: tool.name,
			description: tool.description,
			active: active.has(tool.name),
		})),
		presets: getPresetRuntime()?.names() ?? [],
	};
}

function createProvider(
	pi: ExtensionAPI,
	getContext: () => ExtensionContext | undefined,
	current: AutocompleteProvider,
): AutocompleteProvider {
	return {
		triggerCharacters: TRIGGER_CHARACTERS,

		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const token = actionTokenBeforeCursor((lines[cursorLine] ?? "").slice(0, cursorCol));
			if (token === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			if (token.arg !== undefined) {
				if (!isActionName(token.fragment)) {
					// Someone else's `$name:…` token; this feature does not answer for it.
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}
				const items = actionArgSuggestionItems(token, collectSources(pi, getContext()));
				return items.length > 0 ? { prefix: token.token, items } : null;
			}

			// Bare `$…`: action names first, then whatever the stacked provider has.
			const own = actionSuggestionItems(token.fragment);
			const inherited = await current.getSuggestions(lines, cursorLine, cursorCol, options);
			const stacked = inherited && inherited.prefix.startsWith("$") ? inherited.items : [];
			const items = [...own, ...stacked];
			if (items.length === 0) {
				return inherited;
			}
			return { prefix: token.token, items };
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const action = bareActionName(item.value);
			const ctx = action === undefined ? undefined : getContext();
			const idle = ctx !== undefined && ctx.hasUI && (typeof ctx.isIdle === "function" ? ctx.isIdle() : true);
			if (action !== undefined && ctx !== undefined && idle) {
				// The picker answers the argument step, so only the `$` token leaves the draft.
				const cleared = applyTokenCompletion({ lines, cursorLine, cursorCol, value: "", prefix });
				openArgumentPicker(pi, ctx, action);
				return cleared;
			}
			// Items are fully qualified, so the item decides even under a bare `$` prefix.
			if (isActionValue(prefix) || isActionValue(item.value)) {
				return applyTokenCompletion({ lines, cursorLine, cursorCol, value: item.value, prefix });
			}
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function inlineActionsExtension(pi: ExtensionAPI) {
	let sessionContext: ExtensionContext | undefined;

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension" || !event.text.includes("$")) {
			return { action: "continue" };
		}
		const directives = parseDirectives(event.text);
		if (directives.length === 0) {
			return { action: "continue" };
		}
		const active = directives.filter((directive) => !directive.escaped);

		// A picker needs an idle, dialog-capable session; a steered message must not block.
		const interactive = ctx.hasUI && event.streamingBehavior === undefined;
		const applied: string[] = [];
		const problems: string[] = [];

		for (const directive of active) {
			const outcome = await applyDirective({ pi, ctx, interactive }, directive.name, directive.arg);
			if (outcome.applied !== undefined) {
				applied.push(outcome.applied);
			}
			if (outcome.problem !== undefined) {
				problems.push(outcome.problem);
			}
		}

		if (problems.length > 0) {
			ctx.ui.notify(problems.join(" · "), "warning");
		}
		if (applied.length > 0) {
			// Applied before the run starts, so this turn already uses the new state.
			ctx.ui.notify(applied.join(" · "), "info");
		}

		const text = rewriteDirectives(event.text, directives);
		return text.trim().length > 0 ? { action: "transform", text } : { action: "handled" };
	});

	pi.on("session_start", async (_event, ctx) => {
		sessionContext = ctx;
		// Autocomplete is a no-op in print, JSON and RPC modes; the directive
		// itself still applies there, it just has no list.
		ctx.ui.addAutocompleteProvider((current) => createProvider(pi, () => sessionContext, current));
	});

	pi.on("session_shutdown", async () => {
		sessionContext = undefined;
	});
}
