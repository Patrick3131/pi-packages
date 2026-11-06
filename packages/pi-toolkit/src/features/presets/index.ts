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
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

import { type PickerItem, searchablePicker } from "../../shared/searchable-picker.js";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getPresetConfigPaths, loadPresetsFromPaths } from "./config.js";
import { setPresetRuntime } from "./registry.js";
import { resolvePresetToolNames } from "./resolve-tools.js";
import type { Preset, PresetsConfig } from "./types.js";

interface OriginalState {
	model: Model<Api> | undefined;
	thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	tools: string[];
}

/**
 * Session entry `pi-presets` writes whenever the active preset changes.
 * `pi-tools` reads it to avoid re-applying `.pi/tools.json` over a preset.
 */
export const PRESET_STATE_ENTRY_TYPE = "preset-state";

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

	// Publish a narrow runtime so another feature (inline actions) can apply a
	// preset without importing this module's state. Cleared again on shutdown.
	setPresetRuntime({
		names: () => Object.keys(presets),
		apply: async (name, ctx) => {
			const preset = presets[name];
			if (!preset) {
				return false;
			}
			const applied = await applyPreset(name, preset, ctx);
			updateStatus(ctx);
			return applied;
		},
	});

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
		recordPresetState();
		return true;
	}

	/**
	 * Record the active preset in the session so a resume can restore it and so
	 * other extensions can tell that a preset owns the tool set. `null` means no
	 * preset is active; `pi-tools` watches this entry instead of re-applying
	 * `.pi/tools.json` over an explicit preset.
	 */
	function recordPresetState(): void {
		pi.appendEntry(PRESET_STATE_ENTRY_TYPE, { name: activePresetName ?? null });
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
		recordPresetState();
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

		const items: PickerItem[] = presetNames.map((name) => ({
			value: name,
			label: name,
			description: buildPresetDescription(presets[name]),
			current: name === activePresetName,
		}));
		items.push({
			value: "(none)",
			label: "(none)",
			description: "Clear active preset, restore defaults",
		});

		const result = await searchablePicker(ctx, { title: "Select Preset", items });


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

		// Only the current branch may claim the preset: an abandoned branch's entry is not
		// evidence about this session's tool set.
		const presetEntry = ctx.sessionManager
			.getBranch()
			.filter(
				(entry: { type: string; customType?: string }) =>
					entry.type === "custom" && entry.customType === PRESET_STATE_ENTRY_TYPE,
			)
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
			recordPresetState();
		}
	});

	pi.on("session_shutdown", async () => {
		setPresetRuntime(undefined);
	});
}
