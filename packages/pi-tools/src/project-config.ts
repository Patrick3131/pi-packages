import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const TOOLS_JSON_FILENAME = "tools.json";

export type ProjectToolsConfig = Record<string, boolean>;

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

export function loadProjectToolsConfig(path: string): ProjectToolsConfig | undefined {
	if (!existsSync(path)) {
		return undefined;
	}
	try {
		return parseProjectToolsJson(readFileSync(path, "utf8"), path);
	} catch (error) {
		console.error(`Failed to load project tools from ${path}: ${error}`);
		return undefined;
	}
}

/**
 * Fill in tools that are not in the file yet.
 * New names are false. First create seeds currently-active tools as true.
 */
export function reconcileProjectTools(options: {
	existing?: ProjectToolsConfig;
	allToolNames: string[];
	activeTools: string[];
}): { tools: ProjectToolsConfig; added: string[]; created: boolean } {
	const existing = options.existing;
	const created = existing === undefined;
	const tools: ProjectToolsConfig = { ...(existing ?? {}) };
	const active = new Set(options.activeTools);
	const added: string[] = [];

	for (const name of options.allToolNames) {
		if (Object.hasOwn(tools, name)) {
			continue;
		}
		tools[name] = created ? active.has(name) : false;
		added.push(name);
	}

	return { tools, added, created };
}

export function enabledProjectToolNames(tools: ProjectToolsConfig, allToolNames: string[]): string[] {
	const known = new Set(allToolNames);
	return Object.entries(tools)
		.filter(([name, enabled]) => enabled && known.has(name))
		.map(([name]) => name);
}

export function snapshotProjectTools(allToolNames: string[], enabledTools: Iterable<string>): ProjectToolsConfig {
	const enabled = new Set(enabledTools);
	const tools: ProjectToolsConfig = {};
	for (const name of [...allToolNames].sort()) {
		tools[name] = enabled.has(name);
	}
	return tools;
}

export function writeProjectToolsConfig(path: string, tools: ProjectToolsConfig): void {
	mkdirSync(dirname(path), { recursive: true });
	const ordered = Object.fromEntries(
		Object.entries(tools).sort(([left], [right]) => left.localeCompare(right)),
	);
	writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
