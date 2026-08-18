import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	XAI_DEFAULT_TOOL_KEYS,
	type XaiDefaultToolKey,
	type XaiDefaultsConfig,
	type XaiDefaultsTools,
} from "./types.js";

export const XAI_TOOLS_MENU_CHANNEL = "pi-clickable-menu:xai-tools";
export const XAI_DEFAULTS_FILENAME = "xai-defaults.json";

export const DEFAULT_XAI_NETWORK_TOOLS = XAI_DEFAULT_TOOL_KEYS;

/** Names that appear in pi.getActiveTools() after a successful /xai-tools enable. */
export const DEFAULT_XAI_ACTIVE_NAMES: Record<string, string> = {
	web_search: "xai_grok_web_search",
	xai_web_search: "xai_grok_web_search",
	xai_grok_web_search: "xai_grok_web_search",
	xai_generate_text: "xai_generate_text",
	xai_x_search: "xai_x_search",
	xai_multi_agent: "xai_multi_agent",
	xai_deep_research: "xai_deep_research",
	xai_code_execution: "xai_code_execution",
	xai_generate_image: "xai_generate_image",
	xai_edit_image: "xai_edit_image",
	xai_image_to_video: "xai_image_to_video",
	xai_analyze_image: "xai_analyze_image",
	xai_critique: "xai_critique",
};

const TOOL_ALIASES: Record<string, XaiDefaultToolKey> = {
	web_search: "web_search",
	xai_web_search: "web_search",
	xai_grok_web_search: "web_search",
	xai_generate_text: "xai_generate_text",
	xai_x_search: "xai_x_search",
	xai_multi_agent: "xai_multi_agent",
	xai_deep_research: "xai_deep_research",
	xai_code_execution: "xai_code_execution",
	xai_generate_image: "xai_generate_image",
	xai_edit_image: "xai_edit_image",
	xai_image_to_video: "xai_image_to_video",
	xai_analyze_image: "xai_analyze_image",
	xai_critique: "xai_critique",
};

export function activeNameFor(tool: string): string {
	return DEFAULT_XAI_ACTIVE_NAMES[tool] ?? tool;
}

export function allToolsOn(): XaiDefaultsTools {
	return Object.fromEntries(XAI_DEFAULT_TOOL_KEYS.map((key) => [key, true])) as XaiDefaultsTools;
}

export function defaultXaiDefaultsConfig(): XaiDefaultsConfig {
	return { enabled: true, tools: allToolsOn() };
}

export function isXaiCompatibleProvider(provider: unknown): boolean {
	return provider === "xai-auth" || provider === "xai";
}

export function getXaiDefaultsConfigPaths(
	cwd: string,
	agentDir: string,
	configDirName = ".pi",
): { globalPath: string; projectPath: string } {
	return {
		globalPath: join(agentDir, XAI_DEFAULTS_FILENAME),
		projectPath: join(cwd, configDirName, XAI_DEFAULTS_FILENAME),
	};
}

export function parseXaiDefaultsJson(content: string, source = XAI_DEFAULTS_FILENAME): Partial<XaiDefaultsConfig> {
	const parsed: unknown = JSON.parse(content);
	if (!isPlainObject(parsed)) {
		throw new Error(`${source} must be a JSON object.`);
	}

	const result: Partial<XaiDefaultsConfig> = {};
	if (parsed.enabled !== undefined) {
		result.enabled = requireBoolean(parsed.enabled, `${source}.enabled`);
	}

	const toolSource = isPlainObject(parsed.tools) ? parsed.tools : parsed;
	const tools: Partial<XaiDefaultsTools> = {};
	for (const [rawName, value] of Object.entries(toolSource)) {
		if (rawName === "enabled" || rawName === "tools") {
			continue;
		}
		const key = TOOL_ALIASES[rawName];
		if (!key) {
			throw new Error(`${source} has unknown tool "${rawName}".`);
		}
		tools[key] = requireBoolean(value, `${source}.${isPlainObject(parsed.tools) ? "tools." : ""}${rawName}`);
	}
	if (Object.keys(tools).length > 0) {
		result.tools = tools as XaiDefaultsTools;
	}
	return result;
}

export function mergeXaiDefaultsConfig(
	globalConfig: Partial<XaiDefaultsConfig>,
	projectConfig: Partial<XaiDefaultsConfig>,
): XaiDefaultsConfig {
	const base = defaultXaiDefaultsConfig();
	return {
		enabled: projectConfig.enabled ?? globalConfig.enabled ?? base.enabled,
		tools: {
			...base.tools,
			...globalConfig.tools,
			...projectConfig.tools,
		},
	};
}

export function loadXaiDefaultsConfig(globalPath: string, projectPath: string): XaiDefaultsConfig {
	return mergeXaiDefaultsConfig(readConfigFile(globalPath), readConfigFile(projectPath));
}

export function enabledToolNames(config: XaiDefaultsConfig): string[] {
	if (!config.enabled) {
		return [];
	}
	return XAI_DEFAULT_TOOL_KEYS.filter((key) => config.tools[key] === true);
}

function readConfigFile(path: string): Partial<XaiDefaultsConfig> {
	if (!existsSync(path)) {
		return {};
	}
	try {
		return parseXaiDefaultsJson(readFileSync(path, "utf8"), path);
	} catch (error) {
		console.error(`Failed to load xAI defaults from ${path}: ${error}`);
		return {};
	}
}

function requireBoolean(value: unknown, source: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${source} must be true or false.`);
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
