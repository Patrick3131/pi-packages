/**
 * Official Pi /tools command, packaged so it can be installed like pi-presets.
 *
 * Source: @earendil-works/pi-coding-agent examples/extensions/tools.ts
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Box, Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

import { getToolsArgumentCompletions, matchTools, parseToolsArgs } from "./args.js";
import { formatToolDetails, formatToolSummary, formatToolsDump } from "./format.js";
import { resolveEnabledTools, sameToolSet } from "./state.js";

interface ToolsState {
	enabledTools: string[];
	knownTools?: string[];
}

export interface ToolsPrintData {
	text: string;
	query?: string;
	toolNames: string[];
}

const PRINT_ENTRY_TYPE = "tools-print";

export default function toolsExtension(pi: ExtensionAPI) {
	let enabledTools: Set<string> = new Set();
	let allTools: ToolInfo[] = [];
	let lastSnapshot: ToolsState | undefined;

	function persistState() {
		lastSnapshot = {
			enabledTools: Array.from(enabledTools),
			knownTools: allTools.map((tool) => tool.name),
		};
		pi.appendEntry<ToolsState>("tools-config", lastSnapshot);
	}

	function applyTools() {
		pi.setActiveTools(Array.from(enabledTools));
	}

	function syncEnabledTools() {
		allTools = pi.getAllTools();
		const next = resolveEnabledTools({
			allToolNames: allTools.map((tool) => tool.name),
			activeTools: pi.getActiveTools(),
			savedTools: lastSnapshot?.enabledTools,
			knownTools: lastSnapshot?.knownTools,
		});
		const changed = !sameToolSet(enabledTools, next) || !sameToolSet(pi.getActiveTools(), next);
		enabledTools = new Set(next);
		return changed;
	}

	function restoreFromBranch(ctx: ExtensionContext) {
		const branchEntries = ctx.sessionManager.getBranch();
		lastSnapshot = undefined;

		for (const entry of branchEntries) {
			if (entry.type === "custom" && entry.customType === "tools-config") {
				const data = entry.data as ToolsState | undefined;
				if (data?.enabledTools) {
					lastSnapshot = data;
				}
			}
		}

		if (syncEnabledTools()) {
			applyTools();
			persistState();
		} else if (lastSnapshot) {
			applyTools();
		}
	}

	function printTools(query: string, ctx: ExtensionCommandContext) {
		if (syncEnabledTools()) {
			applyTools();
			persistState();
		}
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

		if (syncEnabledTools()) {
			applyTools();
			persistState();
		}
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
					persistState();
				},
				() => {
					done(undefined);
				},
			);

			container.addChild(settingsList);

			return {
				render(width: number) {
					return container.render(width).map((line) =>
						line.includes("Enter/Space to change")
							? listTheme.hint("  i more details · Enter/Space to change · Esc to cancel")
							: line,
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
		description: "Enable/disable tools, or print their details",
		getArgumentCompletions: (prefix) => getToolsArgumentCompletions(prefix, pi.getAllTools()),
		handler: async (args, ctx) => {
			const command = parseToolsArgs(args);
			if (command.action === "print") {
				printTools(command.query, ctx);
				return;
			}
			if (command.action === "unknown") {
				ctx.ui.notify(`Unknown /tools argument "${command.raw}". Try /tools or /tools print [name]`, "error");
				return;
			}
			await showPicker(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});
}
