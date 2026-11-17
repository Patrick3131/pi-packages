/**
 * Official Pi /tools command, packaged so it can be installed like pi-presets.
 *
 * Project defaults live in <cwd>/.pi/tools.json and are input only: nothing in a
 * session lifecycle writes that file. Only `Ctrl+S` / `/tools save` writes, and that
 * write merges instead of reconciling, so a catalog that happens to be missing
 * names (restricted allowlist, MCP server still connecting, extension that
 * failed to load, delegated child session) can never delete or flip them.
 *
 * A name the file does not mention keeps Pi's native choice; absence is never a
 * disable instruction.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { Box, matchesKey, Text } from "@earendil-works/pi-tui";

import { searchablePicker } from "../../shared/searchable-picker.js";
import { cliOwnsTools, getToolsArgumentCompletions, matchTools, parseToolsArgs } from "./args.js";
import {
	formatToolsDump,
	formatToolsList,
	formatUnavailableSaved,
	isDeclaredSwitch,
	isHiddenTool,
	isIndirectlyReachable,
} from "./format.js";
import { buildToolPickerRows, formatPickerToolDescription } from "./picker.js";
import {
	getProjectToolsPath,
	mergeProjectTools,
	type ProjectToolsConfig,
	projectToolOverrides,
	readProjectToolsConfig,
	unavailableSavedToolNames,
	writeProjectToolsConfig,
} from "./project-config.js";
import { activePresetName, declaresToolLoadout, sameToolSet } from "./state.js";

export interface ToolsPrintData {
	text: string;
	query?: string;
	toolNames: string[];
	/** "dump" (default) is the diagnostic detail dump; "list" is the compact roster. */
	mode?: "dump" | "list";
}

const PRINT_ENTRY_TYPE = "tools-print";

const START_LIST_ENV = "PI_TOOLS_LIST_AT_START";
const START_LIST_TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Opt-in startup roster via the environment. `.pi/tools.json` stays a map of
 * tool decisions the active set honors; a display preference there would leak
 * into the override and save logic, so the environment owns this switch.
 */
function startRosterRequested(): boolean {
	const value = (process.env[START_LIST_ENV] ?? "").trim().toLowerCase();
	return START_LIST_TRUTHY.has(value);
}

/**
 * Fresh sessions only. Resume, fork, and reload replay the transcript —
 * including a roster printed earlier — so reprinting would duplicate it, and
 * an event without a known reason is treated the same way.
 */
function isFreshSessionStart(event: unknown): boolean {
	const reason = (event as { reason?: string } | undefined)?.reason;
	return reason === "startup" || reason === "new";
}

export default function toolsExtension(pi: ExtensionAPI) {
	let enabledTools: Set<string> = new Set();
	let allTools: ToolInfo[] = [];

	function refreshCatalog() {
		allTools = pi.getAllTools();
	}

	function catalogNames(): string[] {
		return allTools.map((tool) => tool.name);
	}

	/**
	 * Tools a save may record: only those where declaring them to the model is an
	 * enforced decision. An inactive `deferred`, `codemode`, or `hidden` tool is not
	 * a decision Pi can honor, so writing one would only add noise to the file.
	 */
	function savableToolNames(): string[] {
		return allTools.filter(isDeclaredSwitch).map((tool) => tool.name);
	}

	function projectPath(cwd: string): string {
		return getProjectToolsPath(cwd, CONFIG_DIR_NAME);
	}

	/**
	 * A delegated child session (subagent) receives its tool set from the agent
	 * that launched it and shares the project directory with its parent. It is
	 * not the owner of this project's preferences, so it neither applies nor
	 * saves them.
	 */
	function sessionOwnsProjectPreferences(ctx: ExtensionContext): boolean {
		try {
			const header = ctx.sessionManager.getHeader?.();
			return header?.parentSession === undefined;
		} catch {
			return true;
		}
	}

	/**
	 * A job preset selects tools for a specific task; `.pi/tools.json` only
	 * describes the repo's resting defaults. When a preset is active it owns the
	 * tool set, so the file must not be applied behind it.
	 *
	 * `pi.getFlag` only reads flags the calling extension registered, and Pi
	 * rejects a second owner for the same flag, so the shared signal is the
	 * `preset-state` entry `pi-presets` records in the session. `getBranch`
	 * keeps an abandoned branch's entry from claiming ownership.
	 */
	function presetOwnsTools(ctx: ExtensionContext): boolean {
		return activePresetName({ entries: ctx.sessionManager.getBranch() }) !== undefined;
	}

	/**
	 * Apply the file as overrides on top of what this session already has:
	 * mentioned tools are turned on or off, unmentioned tools are left alone.
	 * Nothing is written, and a name this session cannot see is simply unknown.
	 */
	function applyProjectOverrides(tools: ProjectToolsConfig): boolean {
		const { enable, disable } = projectToolOverrides(tools, catalogNames());
		const next = new Set(pi.getActiveTools());
		for (const name of enable) {
			next.add(name);
		}
		for (const name of disable) {
			next.delete(name);
		}
		const nextNames = Array.from(next);
		if (sameToolSet(pi.getActiveTools(), nextNames)) {
			return false;
		}
		pi.setActiveTools(nextNames);
		enabledTools = new Set(pi.getActiveTools());
		return true;
	}

	function saveProjectDefaults(ctx: ExtensionCommandContext): void {
		if (!sessionOwnsProjectPreferences(ctx)) {
			ctx.ui.notify("A delegated subagent session does not own this project's tool preferences.", "warning");
			return;
		}
		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		const path = projectPath(ctx.cwd);
		const existing = readProjectToolsConfig(path);
		if (existing.status === "invalid") {
			ctx.ui.notify(
				`${path} is not valid JSON tool preferences (${existing.error}). Fix or remove it, then save again.`,
				"error",
			);
			return;
		}
		const tools = mergeProjectTools({
			existing: existing.status === "ok" ? existing.tools : undefined,
			updateToolNames: savableToolNames(),
			activeTools: pi.getActiveTools(),
		});
		writeProjectToolsConfig(path, tools);
		ctx.ui.notify(`Saved project tool defaults to ${path}`, "info");
	}

	function readPreferences(ctx: ExtensionContext): ProjectToolsConfig | undefined {
		const path = projectPath(ctx.cwd);
		const read = readProjectToolsConfig(path);
		if (read.status === "invalid") {
			ctx.ui.notify(`${path} is not valid JSON tool preferences: ${read.error}`, "warning");
			return undefined;
		}
		return read.status === "ok" ? read.tools : undefined;
	}

	function printTools(
		query: string,
		ctx: ExtensionContext,
		mode: "dump" | "list" = "dump",
		options: { notifyOutsideTui?: boolean } = {},
	) {
		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		const matched = matchTools(allTools, query);
		if (matched.length === 0) {
			ctx.ui.notify(query ? `No tools match "${query}"` : "No tools are registered.", "warning");
			return;
		}

		let text: string;
		if (mode === "list") {
			// The roster is a glance, not a diagnosis: it skips the saved-preferences
			// warnings and the unavailable section that the dump reports.
			text = formatToolsList(matched, { enabledTools });
		} else {
			const preferences = readPreferences(ctx) ?? {};
			const unavailable = unavailableSavedToolNames(preferences, catalogNames());
			const sections = [formatToolsDump(matched, { enabledTools })];
			const savedSection = query ? "" : formatUnavailableSaved(unavailable);
			if (savedSection) {
				sections.push(savedSection);
			}
			text = sections.join("\n\n---\n\n");
		}
		pi.appendEntry<ToolsPrintData>(PRINT_ENTRY_TYPE, {
			text,
			query: query || undefined,
			toolNames: matched.map((tool) => tool.name),
			mode: mode === "list" ? "list" : undefined,
		});

		if (options.notifyOutsideTui !== false && ctx.mode !== "tui") {
			ctx.ui.notify(text, "info");
		}
	}

	async function showPicker(ctx: ExtensionCommandContext) {
		if (ctx.mode !== "tui") {
			// Pi Web and other RPC clients cannot render Pi's terminal picker. Keep
			// the bare command useful there by falling back to the same transcript
			// dump as `/tools print` instead of surfacing an error notification.
			printTools("", ctx);
			return;
		}

		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		readPreferences(ctx);
		let detailsMode = false;

		/**
		 * Declared-switch tools are the only rows with a working toggle. `deferred`
		 * and `codemode` tools stay reachable while inactive, so they appear below as
		 * read-only rows for a complete overview; `hidden` tools cannot be activated
		 * and are reported only as a count. Exposure is set in configuration.
		 */
		const listedTools = allTools.filter((tool) => isDeclaredSwitch(tool) || isIndirectlyReachable(tool));
		const hiddenCount = allTools.filter(isHiddenTool).length;
		const hasIndirect = allTools.some(isIndirectlyReachable);

		/**
		 * Status is read back from Pi after every change: the picker must not claim a
		 * toggle took effect when Pi ignored it.
		 */
		function statusOf(tool: ToolInfo): string {
			return formatPickerToolDescription(tool, { enabledTools, detailsMode });
		}

		const items = buildToolPickerRows(allTools, { enabledTools, detailsMode });

		function applyToggle(name: string): void {
			const tool = listedTools.find((candidate) => candidate.name === name);
			if (!tool || !isDeclaredSwitch(tool)) {
				return;
			}

			if (enabledTools.has(name)) {
				enabledTools.delete(name);
			} else {
				enabledTools.add(name);
			}
			pi.setActiveTools(Array.from(enabledTools));
			// Read back what Pi accepted so the next render is honest.
			enabledTools = new Set(pi.getActiveTools());
			const item = items.find((candidate) => candidate.value === name);
			if (item) {
				item.current = enabledTools.has(name);
				item.description = statusOf(tool);
			}
		}

		function refreshDescriptions(): void {
			for (const item of items) {
				const tool = listedTools.find((candidate) => candidate.name === item.value);
				if (tool) {
					item.description = statusOf(tool);
				}
			}
		}

		const subtitleNotes: string[] = [];
		if (hasIndirect) {
			subtitleNotes.push("indirect rows are read-only");
		}
		if (hiddenCount > 0) {
			subtitleNotes.push(`${hiddenCount} hidden not shown`);
		}
		const subtitle = subtitleNotes.length > 0
			? `${subtitleNotes.join(" · ")} · exposure set in config`
			: undefined;

		await searchablePicker(ctx, {
			title: "Tool Configuration",
			subtitle,
			items,
			filters: [
				{ label: "all" },
				{ label: "active", matches: (item) => item.current === true },
				{
					label: "inactive",
					matches: (item) =>
						item.kind !== "header" && item.selectable !== false && item.current === false,
				},
			],
			hint: "? details · ctrl+s save",
			onActivate: (item) => applyToggle(item.value),
			// Printable letters stay searchable; actions use non-letter keys.
			onKey: (data) => {
				if (matchesKey(data, "ctrl+s")) {
					saveProjectDefaults(ctx);
					return true;
				}
				if (matchesKey(data, "?")) {
					detailsMode = !detailsMode;
					refreshDescriptions();
					return true;
				}
				return false;
			},
		});
	}

	pi.registerEntryRenderer<ToolsPrintData>(PRINT_ENTRY_TYPE, (entry, _options, theme) => {
		const data = entry.data;
		if (!data?.text) {
			return undefined;
		}

		let title = "Tools dump";
		if (data.mode === "list") {
			title = data.query ? `Tools (list: ${data.query})` : "Tools";
		} else if (data.query) {
			title = `Tools dump (${data.query})`;
		}
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		box.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
		box.addChild(new Text(data.text, 1, 0));
		return box;
	});

	pi.registerCommand("tools", {
		description: "Enable/disable session tools, print details, or save project defaults",
		getArgumentCompletions: (prefix) => getToolsArgumentCompletions(prefix, pi.getAllTools()),
		handler: async (args, ctx) => {
			const command = parseToolsArgs(args);
			if (command.action === "print") {
				printTools(command.query, ctx);
				return;
			}
			if (command.action === "list") {
				printTools(command.query, ctx, "list");
				return;
			}
			if (command.action === "save") {
				saveProjectDefaults(ctx);
				return;
			}
			if (command.action === "unknown") {
				ctx.ui.notify(
				`Unknown /tools argument "${command.raw}". Try /tools, /tools list [name], /tools print [name], or /tools save`,
					"error",
				);
				return;
			}
			await showPicker(ctx);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		refreshCatalog();
		const entries = ctx.sessionManager.getEntries();
		// CLI selection, a delegated child session, an owning preset, and a
		// transcript-declared loadout each own the tool set; only a session that has
		// not chosen yet takes the project defaults.
		if (
			sessionOwnsProjectPreferences(ctx) &&
			!cliOwnsTools(process.argv.slice(2)) &&
			!presetOwnsTools(ctx) &&
			!declaresToolLoadout(entries)
		) {
			const tools = readPreferences(ctx);
			if (tools) {
				applyProjectOverrides(tools);
			}
		}

		if (
			startRosterRequested() &&
			isFreshSessionStart(event) &&
			sessionOwnsProjectPreferences(ctx) &&
			!declaresToolLoadout(entries)
		) {
			// The roster is a transcript entry, not a toast: non-TUI clients keep it in
			// the session file instead of being notified on every startup.
			printTools("", ctx, "list", { notifyOutsideTui: false });
		}
	});
}
