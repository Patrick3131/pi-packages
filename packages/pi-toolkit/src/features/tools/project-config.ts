import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const TOOLS_JSON_FILENAME = "tools.json";

export type ProjectToolsConfig = Record<string, boolean>;

/**
 * Result of reading `.pi/tools.json`. A malformed file is reported instead of
 * being treated as absent, so no caller can silently replace preferences the
 * user wrote.
 */
export type ProjectToolsRead =
	| { status: "missing" }
	| { status: "invalid"; error: string }
	| { status: "ok"; tools: ProjectToolsConfig };

export function getProjectToolsPath(cwd: string, configDirName = ".pi"): string {
	return join(cwd, configDirName, TOOLS_JSON_FILENAME);
}

export function parseProjectToolsJson(content: string, source = TOOLS_JSON_FILENAME): ProjectToolsConfig {
	const parsed: unknown = JSON.parse(content);
	if (!isPlainObject(parsed)) {
		throw new Error(`${source} must be a JSON object of tool names to true/false.`);
	}

	const tools: ProjectToolsConfig = {};
	for (const [name, value] of Object.entries(parsed)) {
		if (!name.trim()) {
			throw new Error(`${source} contains an empty tool name.`);
		}
		if (typeof value !== "boolean") {
			throw new Error(`${source}.${name} must be true or false.`);
		}
		tools[name] = value;
	}
	return tools;
}

export function readProjectToolsConfig(path: string): ProjectToolsRead {
	if (!existsSync(path)) {
		return { status: "missing" };
	}
	try {
		return { status: "ok", tools: parseProjectToolsJson(readFileSync(path, "utf8"), path) };
	} catch (error) {
		return { status: "invalid", error: error instanceof Error ? error.message : String(error) };
	}
}

export function loadProjectToolsConfig(path: string): ProjectToolsConfig | undefined {
	const read = readProjectToolsConfig(path);
	if (read.status === "ok") {
		return read.tools;
	}
	if (read.status === "invalid") {
		console.error(`Failed to load project tools from ${path}: ${read.error}`);
	}
	return undefined;
}

/**
 * The on/off decisions the file makes about tools this catalog knows.
 *
 * A name the file does not mention keeps whatever Pi decided for it. Absence is
 * never a disable instruction: a session catalog can be missing names because of
 * a restricted allowlist, a still-connecting MCP server, or a failed extension
 * load, and none of those is a statement about the user's preferences.
 */
export function projectToolOverrides(
	tools: ProjectToolsConfig,
	knownToolNames: string[],
): { enable: string[]; disable: string[] } {
	const known = new Set(knownToolNames);
	const enable: string[] = [];
	const disable: string[] = [];
	for (const [name, enabled] of Object.entries(tools)) {
		if (!known.has(name)) {
			continue;
		}
		if (enabled) {
			enable.push(name);
		} else {
			disable.push(name);
		}
	}
	return { enable, disable };
}

/**
 * Explicit-save merge: rewrite only the tools this session can see, and keep
 * every other key exactly as it was. Saving from a smaller catalog therefore
 * cannot drop preferences it never had the evidence to judge.
 */
export function mergeProjectTools(options: {
	existing?: ProjectToolsConfig;
	updateToolNames: string[];
	activeTools: string[];
}): ProjectToolsConfig {
	const merged: ProjectToolsConfig = { ...(options.existing ?? {}) };
	const active = new Set(options.activeTools);
	for (const name of options.updateToolNames) {
		merged[name] = active.has(name);
	}
	return merged;
}

/** Saved names this session does not register, which a save preserves but cannot apply. */
export function unavailableSavedToolNames(tools: ProjectToolsConfig, knownToolNames: string[]): string[] {
	const known = new Set(knownToolNames);
	return Object.keys(tools)
		.filter((name) => !known.has(name))
		.sort();
}

/**
 * Write the map atomically: a same-directory temporary file is renamed into
 * place, so a reader never observes a half-written file. Last writer wins; this
 * is not a cross-process merge guarantee.
 */
export function writeProjectToolsConfig(path: string, tools: ProjectToolsConfig): void {
	mkdirSync(dirname(path), { recursive: true });
	const ordered = Object.fromEntries(
		Object.entries(tools).sort(([left], [right]) => left.localeCompare(right)),
	);
	const tempPath = `${path}.${process.pid}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(ordered, null, 2)}\n`);
	renameSync(tempPath, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
