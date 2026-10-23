/**
 * Official Pi /tools command, packaged so it can be installed like pi-presets.
 *
 * Project defaults live in <cwd>/.pi/tools.json and are input only: nothing in a
 * session lifecycle writes that file. Only `s` / `/tools save` writes, and that
 * write merges instead of reconciling, so a catalog that happens to be missing
 * names (restricted allowlist, MCP server still connecting, extension that
 * failed to load, delegated child session) can never delete or flip them.
 *
 * A name the file does not mention keeps Pi's native choice; absence is never a
 * disable instruction.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Box, Container, type SettingItem, SettingsList, Text, truncateToWidth } from "@earendil-works/pi-tui";

import { cliOwnsTools, getToolsArgumentCompletions, matchTools, parseToolsArgs } from "./args.js";
import {
	formatToolDetails,
	formatToolSummary,
	formatToolsDump,
	formatUnavailableSaved,
	isDeclaredSwitch,
} from "./format.js";
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
}

const PRINT_ENTRY_TYPE = "tools-print";
const HINT = "  i more details · s save project defaults · Enter/Space to change · Esc to cancel";

export function fitPickerLine(line: string, width: number): string {
	return truncateToWidth(line, Math.max(0, width));
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

	function printTools(query: string, ctx: ExtensionCommandContext) {
		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		const matched = matchTools(allTools, query);
		if (matched.length === 0) {
			ctx.ui.notify(`No tools match "${query}"`, "warning");
			return;
		}

		const preferences = readPreferences(ctx) ?? {};
		const unavailable = unavailableSavedToolNames(preferences, catalogNames());
		const sections = [formatToolsDump(matched, { enabledTools })];
		const savedSection = query ? "" : formatUnavailableSaved(unavailable);
		if (savedSection) {
			sections.push(savedSection);
		}
		const text = sections.join("\n\n---\n\n");
		pi.appendEntry<ToolsPrintData>(PRINT_ENTRY_TYPE, {
			text,
			query: query || undefined,
			toolNames: matched.map((tool) => tool.name),
		});

		if (ctx.mode !== "tui") {
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
		 * Only tools whose active-set membership is an enforced decision appear here.
		 * `codemode` and `deferred` tools stay reachable while inactive, and `hidden`
		 * tools cannot be activated at all, so a row for them would offer a toggle Pi
		 * ignores. Their exposure is set in configuration and reported by `/mcp`.
		 */
		const pickerTools = allTools.filter(isDeclaredSwitch);
		const withheld = allTools.length - pickerTools.length;

		/**
		 * Status is read back from Pi after every change: the picker must not claim a
		 * toggle took effect when Pi ignored it.
		 */
		function statusOf(tool: ToolInfo): string {
			return detailsMode
				? formatToolDetails(tool, { enabled: enabledTools.has(tool.name) })
				: formatToolSummary(tool);
		}

		await ctx.ui.custom((tui, theme, _kb, done) => {
			const items: SettingItem[] = pickerTools.map((tool) => ({
				id: tool.name,
				label: tool.name,
				description: statusOf(tool),
				currentValue: enabledTools.has(tool.name) ? "enabled" : "disabled",
				values: ["enabled", "disabled"],
			}));

			const container = new Container();
			container.addChild(
				new (class {
					render(_width: number) {
						return [theme.fg("accent", theme.bold("Tool Configuration")), ""];
					}
					invalidate() {}
				})(),
			);

			const listTheme = getSettingsListTheme();
			const settingsList = new SettingsList(
				items,
				Math.min(items.length + 2, 15),
				listTheme,
				(id, newValue) => {
					if (newValue === "enabled") {
						enabledTools.add(id);
					} else {
						enabledTools.delete(id);
					}
					pi.setActiveTools(Array.from(enabledTools));
					// Read back what Pi accepted so the next render is honest.
					enabledTools = new Set(pi.getActiveTools());
					const item = items.find((candidate) => candidate.id === id);
					const tool = pickerTools.find((candidate) => candidate.name === id);
					if (item && tool) {
						item.description = statusOf(tool);
						item.currentValue = enabledTools.has(id) ? "enabled" : "disabled";
					}
				},
				() => {
					done(undefined);
				},
			);

			container.addChild(settingsList);

			if (withheld > 0) {
				container.addChild(
					new Text(
						listTheme.hint(`  ${withheld} tools not listed · exposure set in /mcp · see /tools print`),
						0,
						0,
					),
				);
			}

			return {
				render(width: number) {
					return container.render(width).map((line) => {
						const renderedLine = line.includes("Enter/Space to change") ? listTheme.hint(HINT) : line;
						return fitPickerLine(renderedLine, width);
					});
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					if (data === "i" || data === "I") {
						detailsMode = !detailsMode;
						for (const item of items) {
							const tool = pickerTools.find((candidate) => candidate.name === item.id);
							if (tool) {
								item.description = statusOf(tool);
							}
						}
						tui.requestRender();
						return;
					}
					if (data === "s" || data === "S") {
						saveProjectDefaults(ctx);
						tui.requestRender();
						return;
					}

					settingsList.handleInput?.(data);
					tui.requestRender();
				},
			};
		});
	}

	pi.registerEntryRenderer<ToolsPrintData>(PRINT_ENTRY_TYPE, (entry, _options, theme) => {
		const data = entry.data;
		if (!data?.text) {
			return undefined;
		}

		const title = data.query ? `Tools dump (${data.query})` : "Tools dump";
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
			if (command.action === "save") {
				if (!sessionOwnsProjectPreferences(ctx)) {
					ctx.ui.notify("A delegated subagent session does not own this project's tool preferences.", "warning");
					return;
				}
				saveProjectDefaults(ctx);
				return;
			}
			if (command.action === "unknown") {
				ctx.ui.notify(
					`Unknown /tools argument "${command.raw}". Try /tools, /tools print [name], or /tools save`,
					"error",
				);
				return;
			}
			await showPicker(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		refreshCatalog();
		if (cliOwnsTools(process.argv.slice(2)) || !sessionOwnsProjectPreferences(ctx) || presetOwnsTools(ctx)) {
			return;
		}
		// Resume, fork, and reload re-declare their own loadout; only a session
		// that has not chosen yet may take the project defaults.
		if (declaresToolLoadout(ctx.sessionManager.getEntries())) {
			return;
		}
		const tools = readPreferences(ctx);
		if (tools) {
			applyProjectOverrides(tools);
		}
	});
}
