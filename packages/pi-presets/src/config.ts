import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Preset, PresetsConfig, ThinkingLevel } from "./types.js";

const THINKING_LEVELS = new Set<ThinkingLevel>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export function mergePresets(globalPresets: PresetsConfig, projectPresets: PresetsConfig): PresetsConfig {
	return { ...globalPresets, ...projectPresets };
}

export function parsePresetsJson(content: string, source = "presets.json"): PresetsConfig {
	const parsed: unknown = JSON.parse(content);
	if (!isPlainObject(parsed)) {
		throw new Error(`${source} must be a JSON object of named presets.`);
	}

	const presets: PresetsConfig = {};
	for (const [name, value] of Object.entries(parsed)) {
		if (!name.trim()) {
			throw new Error(`${source} contains an empty preset name.`);
		}
		presets[name] = parsePreset(value, `${source} "${name}"`);
	}
	return presets;
}

export function loadPresetsFromPaths(globalPath: string, projectPath: string): PresetsConfig {
	return mergePresets(readPresetsFile(globalPath), readPresetsFile(projectPath));
}

export function getPresetConfigPaths(cwd: string, agentDir: string, configDirName = ".pi"): {
	globalPath: string;
	projectPath: string;
} {
	return {
		globalPath: join(agentDir, "presets.json"),
		projectPath: join(cwd, configDirName, "presets.json"),
	};
}

function readPresetsFile(path: string): PresetsConfig {
	if (!existsSync(path)) return {};
	try {
		return parsePresetsJson(readFileSync(path, "utf-8"), path);
	} catch (error) {
		console.error(`Failed to load presets from ${path}: ${error}`);
		return {};
	}
}

function parsePreset(value: unknown, source: string): Preset {
	if (!isPlainObject(value)) {
		throw new Error(`${source} must be an object.`);
	}

	const preset: Preset = {};
	if (value.provider !== undefined) preset.provider = requireString(value.provider, `${source}.provider`);
	if (value.model !== undefined) preset.model = requireString(value.model, `${source}.model`);
	if (value.thinkingLevel !== undefined) {
		const thinkingLevel = requireString(value.thinkingLevel, `${source}.thinkingLevel`);
		if (!THINKING_LEVELS.has(thinkingLevel as ThinkingLevel)) {
			throw new Error(`${source}.thinkingLevel must be one of ${[...THINKING_LEVELS].join(", ")}.`);
		}
		preset.thinkingLevel = thinkingLevel as ThinkingLevel;
	}
	if (value.tools !== undefined) {
		if (!Array.isArray(value.tools) || !value.tools.every((tool) => typeof tool === "string")) {
			throw new Error(`${source}.tools must be an array of strings.`);
		}
		preset.tools = value.tools;
	}
	if (value.instructions !== undefined) {
		preset.instructions = requireString(value.instructions, `${source}.instructions`);
	}
	return preset;
}

function requireString(value: unknown, source: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${source} must be a non-empty string.`);
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
