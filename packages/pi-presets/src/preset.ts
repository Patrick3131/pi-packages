/**
 * Named job presets for model, thinking level, tools, and extra instructions.
 *
 * Config files (merged, project name replaces the whole global preset):
 * - ~/.pi/agent/presets.json
 * - <cwd>/.pi/presets.json
 *
 * Usage:
 * - `pi --preset plan`
 * - `/preset` picker
 * - `/preset implement`
 * - `Ctrl+Shift+U` cycle
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, DynamicBorder, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Container, Key, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getPresetConfigPaths, loadPresetsFromPaths } from "./config.js";
import { resolvePresetToolNames } from "./resolve-tools.js";
import type { Preset, PresetsConfig } from "./types.js";

interface OriginalState {
	model: Model<Api> | undefined;
	thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	tools: string[];
}

function loadEnabledProjectTools(cwd: string): string[] | undefined {
	try {
		const path = join(cwd, CONFIG_DIR_NAME, "tools.json");
		if (!existsSync(path)) {
			return undefined;
		}
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed !== "object" || parsed === null) {
			return undefined;
		}
		return Object.entries(parsed)
			.filter(([, enabled]) => enabled === true)
			.map(([name]) => name);
	} catch {
		return undefined;
	}
}

export default function presetExtension(pi: ExtensionAPI) {
	let presets: PresetsConfig = {};
	let activePresetName: string | undefined;
	let activePreset: Preset | undefined;
	let originalState: OriginalState | undefined;

	pi.registerFlag("preset", {
		description: "Preset configuration to use",
		type: "string",
	});

	async function applyPreset(name: string, preset: Preset, ctx: ExtensionContext): Promise<boolean> {
		if (activePresetName === undefined) {
			originalState = {
				model: ctx.model,
				thinkingLevel: pi.getThinkingLevel(),
				tools: pi.getActiveTools(),
			};
		}

		if (preset.provider && preset.model) {
			const model = ctx.modelRegistry.find(preset.provider, preset.model);
			if (model) {
				const success = await pi.setModel(model);
				if (!success) {
					ctx.ui.notify(`Preset "${name}": No API key for ${preset.provider}/${preset.model}`, "warning");
				}
			} else {
				ctx.ui.notify(`Preset "${name}": Model ${preset.provider}/${preset.model} not found`, "warning");
			}
		}

		if (preset.thinkingLevel) {
			pi.setThinkingLevel(preset.thinkingLevel);
		}

		if (preset.tools && preset.tools.length > 0) {
			const { valid, unknown } = resolvePresetToolNames({
				requested: preset.tools,
				allToolNames: pi.getAllTools().map((tool) => tool.name),
			});

			if (unknown.length > 0) {
				ctx.ui.notify(`Preset "${name}": Unknown tools: ${unknown.join(", ")}`, "warning");
			}

			if (valid.length > 0) {
				pi.setActiveTools(valid);
			}
		}

		activePresetName = name;
		activePreset = preset;
		return true;
	}

	function buildPresetDescription(preset: Preset): string {
		const parts: string[] = [];
		if (preset.provider && preset.model) parts.push(`${preset.provider}/${preset.model}`);
		if (preset.thinkingLevel) parts.push(`thinking:${preset.thinkingLevel}`);
		if (preset.tools) parts.push(`tools:${preset.tools.join(",")}`);
		if (preset.instructions) {
			const truncated =
				preset.instructions.length > 30 ? `${preset.instructions.slice(0, 27)}...` : preset.instructions;
			parts.push(`"${truncated}"`);
		}
		return parts.join(" | ");
	}

	async function restoreOriginalState(ctx: ExtensionContext): Promise<void> {
		activePresetName = undefined;
		activePreset = undefined;
		if (originalState) {
			if (originalState.model) await pi.setModel(originalState.model);
			pi.setThinkingLevel(originalState.thinkingLevel);
		}
		const projectTools = loadEnabledProjectTools(ctx.cwd);
		if (projectTools) {
			pi.setActiveTools(projectTools);
		} else if (originalState) {
			pi.setActiveTools(originalState.tools);
		} else {
			pi.setActiveTools(["read", "bash", "edit", "write"]);
		}
		ctx.ui.notify("Preset cleared, defaults restored", "info");
		updateStatus(ctx);
	}

	async function showPresetSelector(ctx: ExtensionContext): Promise<void> {
		const presetNames = Object.keys(presets);
		if (presetNames.length === 0) {
			const paths = getPresetConfigPaths(ctx.cwd, getAgentDir(), CONFIG_DIR_NAME);
			ctx.ui.notify(`No presets defined. Add presets to ${paths.globalPath} or ${paths.projectPath}`, "warning");
			return;
		}

		const items: SelectItem[] = presetNames.map((name) => {
			const preset = presets[name];
			return {
				value: name,
				label: name === activePresetName ? `${name} (active)` : name,
				description: buildPresetDescription(preset),
			};
		});
		items.push({
			value: "(none)",
			label: "(none)",
			description: "Clear active preset, restore defaults",
		});

		const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Select Preset"))));

			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);
			container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

			return {
				render(width: number) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!result) return;
		if (result === "(none)") {
			await restoreOriginalState(ctx);
			return;
		}

		const preset = presets[result];
		if (preset) {
			await applyPreset(result, preset, ctx);
			ctx.ui.notify(`Preset "${result}" activated`, "info");
			updateStatus(ctx);
		}
	}

	function updateStatus(ctx: ExtensionContext) {
		if (activePresetName) {
			ctx.ui.setStatus("preset", ctx.ui.theme.fg("accent", `preset:${activePresetName}`));
		} else {
			ctx.ui.setStatus("preset", undefined);
		}
	}

	async function cyclePreset(ctx: ExtensionContext): Promise<void> {
		const presetNames = Object.keys(presets).sort();
		if (presetNames.length === 0) {
			const paths = getPresetConfigPaths(ctx.cwd, getAgentDir(), CONFIG_DIR_NAME);
			ctx.ui.notify(`No presets defined. Add presets to ${paths.globalPath} or ${paths.projectPath}`, "warning");
			return;
		}

		const cycleList = ["(none)", ...presetNames];
		const currentName = activePresetName ?? "(none)";
		const currentIndex = cycleList.indexOf(currentName);
		const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cycleList.length;
		const nextName = cycleList[nextIndex];

		if (nextName === "(none)") {
			await restoreOriginalState(ctx);
			return;
		}

		const preset = presets[nextName];
		if (!preset) return;
		await applyPreset(nextName, preset, ctx);
		ctx.ui.notify(`Preset "${nextName}" activated`, "info");
		updateStatus(ctx);
	}

	pi.registerShortcut(Key.ctrlShift("u"), {
		description: "Cycle presets",
		handler: async (ctx) => {
			await cyclePreset(ctx);
		},
	});

	pi.registerCommand("preset", {
		description: "Switch preset configuration",
		handler: async (args, ctx) => {
			if (args?.trim()) {
				const name = args.trim();
				const preset = presets[name];
				if (!preset) {
					const available = Object.keys(presets).join(", ") || "(none defined)";
					ctx.ui.notify(`Unknown preset "${name}". Available: ${available}`, "error");
					return;
				}
				await applyPreset(name, preset, ctx);
				ctx.ui.notify(`Preset "${name}" activated`, "info");
				updateStatus(ctx);
				return;
			}
			await showPresetSelector(ctx);
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (activePreset?.instructions) {
			return { systemPrompt: `${event.systemPrompt}\n\n${activePreset.instructions}` };
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const paths = getPresetConfigPaths(ctx.cwd, getAgentDir(), CONFIG_DIR_NAME);
		presets = loadPresetsFromPaths(paths.globalPath, paths.projectPath);

		const presetFlag = pi.getFlag("preset");
		if (typeof presetFlag === "string" && presetFlag) {
			const preset = presets[presetFlag];
			if (preset) {
				await applyPreset(presetFlag, preset, ctx);
				ctx.ui.notify(`Preset "${presetFlag}" activated`, "info");
			} else {
				const available = Object.keys(presets).join(", ") || "(none defined)";
				ctx.ui.notify(`Unknown preset "${presetFlag}". Available: ${available}`, "warning");
			}
		}

		const entries = ctx.sessionManager.getEntries();
		const presetEntry = entries
			.filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "preset-state")
			.pop() as { data?: { name: string } } | undefined;

		if (presetEntry?.data?.name && !presetFlag) {
			const preset = presets[presetEntry.data.name];
			if (preset) {
				activePresetName = presetEntry.data.name;
				activePreset = preset;
			}
		}

		updateStatus(ctx);
	});

	pi.on("turn_start", async () => {
		if (activePresetName) {
			pi.appendEntry("preset-state", { name: activePresetName });
		}
	});
}
