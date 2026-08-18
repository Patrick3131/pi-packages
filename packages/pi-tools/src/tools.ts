/**
 * Official Pi /tools command, packaged so it can be installed like pi-presets.
 *
 * Project defaults live in <cwd>/.pi/tools.json.
 * /tools toggles are session-only unless the user presses s or runs /tools save.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Box, Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

import { getToolsArgumentCompletions, matchTools, parseToolsArgs } from "./args.js";
import { formatToolDetails, formatToolSummary, formatToolsDump } from "./format.js";
import {
	enabledProjectToolNames,
	getProjectToolsPath,
	loadProjectToolsConfig,
	reconcileProjectTools,
	snapshotProjectTools,
	writeProjectToolsConfig,
} from "./project-config.js";
import { sameToolSet } from "./state.js";
import { enableXaiNetworkTools } from "./xai-bridge.js";

export interface ToolsPrintData {
	text: string;
	query?: string;
	toolNames: string[];
}

const PRINT_ENTRY_TYPE = "tools-print";
const HINT = "  i more details · s save project defaults · Enter/Space to change · Esc to cancel";

export default function toolsExtension(pi: ExtensionAPI) {
	let enabledTools: Set<string> = new Set();
	let allTools: ToolInfo[] = [];
	let appliedDefaults = false;

	function applyTools() {
		pi.setActiveTools(Array.from(enabledTools));
	}

	function refreshCatalog() {
		allTools = pi.getAllTools();
	}

	function projectPath(cwd: string): string {
		return getProjectToolsPath(cwd, CONFIG_DIR_NAME);
	}

	function reconcileFile(cwd: string) {
		refreshCatalog();
		const path = projectPath(cwd);
		const existing = loadProjectToolsConfig(path);
		const reconciled = reconcileProjectTools({
			existing,
			allToolNames: allTools.map((tool) => tool.name),
			activeTools: pi.getActiveTools(),
		});
		if (reconciled.created || reconciled.added.length > 0) {
			writeProjectToolsConfig(path, reconciled.tools);
		}
		return { path, tools: reconciled.tools, created: reconciled.created, added: reconciled.added };
	}

	async function applyProjectDefaults(ctx: ExtensionContext, tools: Record<string, boolean>) {
		const next = enabledProjectToolNames(
			tools,
			allTools.map((tool) => tool.name),
		);
		const changed = !sameToolSet(enabledTools, next) || !sameToolSet(pi.getActiveTools(), next);
		enabledTools = new Set(next);
		if (changed) {
			applyTools();
		}
		if (ctx.ui && typeof ctx.ui.notify === "function") {
			await enableXaiNetworkTools(pi, ctx as ExtensionCommandContext, next);
		}
		appliedDefaults = true;
	}

	function saveProjectDefaults(ctx: ExtensionCommandContext) {
		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		const path = projectPath(ctx.cwd);
		const existing = loadProjectToolsConfig(path) ?? {};
		const snapshot = snapshotProjectTools(
			allTools.map((tool) => tool.name),
			enabledTools,
		);
		writeProjectToolsConfig(path, { ...existing, ...snapshot });
		ctx.ui.notify(`Saved project tool defaults to ${path}`, "info");
	}

	function printTools(query: string, ctx: ExtensionCommandContext) {
		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		const matched = matchTools(allTools, query);
		if (matched.length === 0) {
			ctx.ui.notify(`No tools match "${query}"`, "warning");
			return;
		}

		const text = formatToolsDump(matched, { enabledTools });
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
			ctx.ui.notify("/tools requires TUI mode (use /tools print)", "error");
			return;
		}

		refreshCatalog();
		enabledTools = new Set(pi.getActiveTools());
		reconcileFile(ctx.cwd);
		let detailsMode = false;

		function itemDescription(tool: ToolInfo): string {
			return detailsMode
				? formatToolDetails(tool, { enabled: enabledTools.has(tool.name) })
				: formatToolSummary(tool);
		}

		await ctx.ui.custom((tui, theme, _kb, done) => {
			const items: SettingItem[] = allTools.map((tool) => ({
				id: tool.name,
				label: tool.name,
				description: itemDescription(tool),
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
					const item = items.find((candidate) => candidate.id === id);
					const tool = allTools.find((candidate) => candidate.name === id);
					if (item && tool) {
						item.description = itemDescription(tool);
					}
					applyTools();
				},
				() => {
					done(undefined);
				},
			);

			container.addChild(settingsList);

			return {
				render(width: number) {
					return container.render(width).map((line) =>
						line.includes("Enter/Space to change") ? listTheme.hint(HINT) : line,
					);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					if (data === "i" || data === "I") {
						detailsMode = !detailsMode;
						for (const item of items) {
							const tool = allTools.find((candidate) => candidate.name === item.id);
							if (tool) {
								item.description = itemDescription(tool);
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
		appliedDefaults = false;
		const existing = loadProjectToolsConfig(projectPath(ctx.cwd));
		if (!existing) {
			return;
		}
		const { tools } = reconcileFile(ctx.cwd);
		await applyProjectDefaults(ctx, tools);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		const { tools, created } = reconcileFile(ctx.cwd);
		if (!appliedDefaults || created) {
			await applyProjectDefaults(ctx, tools);
		}
	});
}
