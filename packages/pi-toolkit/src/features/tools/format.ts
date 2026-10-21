export interface ToolSourceInfoLike {
	path: string;
	source: string;
	scope: string;
	origin: string;
	baseDir?: string;
}

export interface ToolLike {
	name: string;
	description: string;
	parameters?: unknown;
	promptGuidelines?: string[];
	sourceInfo?: ToolSourceInfoLike;
	/** Pi's exposure for this tool: how the model can reach it, from `pi.getAllTools()`. */
	exposure?: string;
}

/** Exposures whose tools stay callable without being declared to the model. */
const INDIRECT_EXPOSURES = new Set(["codemode", "deferred"]);

/**
 * Exposures where the active-set toggle is a decision Pi enforces: the tool is
 * declared to the model while active.
 *
 * `codemode` and `deferred` tools stay callable and discoverable while inactive,
 * and `hidden` tools cannot be activated at all, so a picker row for them would
 * offer a control that does nothing — and a saved decision the file cannot honor.
 */
const DECLARED_SWITCH_EXPOSURES = new Set(["direct", "model-only"]);

/** Whether declaring this tool to the model is a real, enforced decision. */
export function isDeclaredSwitch(tool: ToolLike): boolean {
	return tool.exposure === undefined || DECLARED_SWITCH_EXPOSURES.has(tool.exposure);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function firstLine(text: string): string {
	const line = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
	return line;
}

export function formatSource(sourceInfo: ToolSourceInfoLike | undefined): string {
	if (!sourceInfo) {
		return "unknown";
	}

	const location = [sourceInfo.source, sourceInfo.scope, sourceInfo.origin].filter(Boolean).join(" · ");
	if (sourceInfo.path && sourceInfo.path !== sourceInfo.source) {
		return `${location} (${sourceInfo.path})`;
	}
	return location || sourceInfo.path || "unknown";
}

/**
 * How this session can actually reach the tool.
 *
 * Membership in the active set only means "declared to the model". Tools with
 * `codemode` or `deferred` exposure stay callable from codemode scripts and
 * `tool_search` while inactive, and `hidden` tools cannot be activated at all,
 * so plain enabled/disabled would misreport both.
 */
export function toolStatus(tool: ToolLike, options?: { enabled?: boolean }): string {
	const exposure = tool.exposure;
	if (exposure === "hidden") {
		return "unavailable (hidden)";
	}
	if (options?.enabled === undefined) {
		return exposure && INDIRECT_EXPOSURES.has(exposure) ? `indirect (${exposure})` : "declared";
	}
	if (options.enabled) {
		return "enabled";
	}
	return exposure && INDIRECT_EXPOSURES.has(exposure) ? `inactive (indirect via ${exposure})` : "disabled";
}

function schemaType(schema: unknown): string {
	if (!isRecord(schema)) {
		return "unknown";
	}
	if (typeof schema.type === "string") {
		return schema.type;
	}
	if (Array.isArray(schema.anyOf)) {
		const types = schema.anyOf.map((entry) => schemaType(entry)).filter((type) => type !== "null" && type !== "unknown");
		if (types.length === 0) {
			return "unknown";
		}
		return [...new Set(types)].join(" | ");
	}
	if (isRecord(schema.properties)) {
		return "object";
	}
	if (schema.items !== undefined) {
		return "array";
	}
	return "unknown";
}

export function formatParameters(parameters: unknown): string[] {
	if (!isRecord(parameters) || !isRecord(parameters.properties)) {
		return [];
	}

	const required = new Set(
		Array.isArray(parameters.required)
			? parameters.required.filter((name): name is string => typeof name === "string")
			: [],
	);

	return Object.entries(parameters.properties).map(([name, schema]) => {
		const optional = !required.has(name);
		const type = schemaType(schema);
		const description = isRecord(schema) && typeof schema.description === "string" ? schema.description : "";
		const suffix = description ? ` — ${description}` : "";
		return `${name}${optional ? "?" : ""}: ${type}${suffix}`;
	});
}

export function formatToolSummary(tool: ToolLike): string {
	const description = firstLine(tool.description) || "No description";
	const source = tool.sourceInfo?.source;
	return source ? `${description}  ·  ${source}` : description;
}

export function formatToolDetails(tool: ToolLike, options?: { enabled?: boolean }): string {
	const lines: string[] = [];
	if (options?.enabled !== undefined || tool.exposure !== undefined) {
		lines.push(`status: ${toolStatus(tool, options)}`);
	}
	if (tool.exposure !== undefined) {
		lines.push(`exposure: ${tool.exposure}`);
	}
	lines.push(`source: ${formatSource(tool.sourceInfo)}`);

	const description = tool.description.trim() || "No description";
	lines.push("", description);

	const parameters = formatParameters(tool.parameters);
	if (parameters.length > 0) {
		lines.push("", "parameters:");
		for (const parameter of parameters) {
			lines.push(`  ${parameter}`);
		}
	} else if (tool.parameters !== undefined) {
		try {
			lines.push("", "parameters:", `  ${JSON.stringify(tool.parameters)}`);
		} catch {
			lines.push("", "parameters: (unreadable schema)");
		}
	}

	if (tool.promptGuidelines && tool.promptGuidelines.length > 0) {
		lines.push("", "guidelines:");
		for (const guideline of tool.promptGuidelines) {
			lines.push(`  - ${guideline}`);
		}
	}

	return lines.join("\n");
}

export function formatToolsDump(tools: ToolLike[], options?: { enabledTools?: Iterable<string> }): string {
	const enabled = options?.enabledTools ? new Set(options.enabledTools) : undefined;
	return tools
		.map((tool) => {
			const status = toolStatus(tool, enabled ? { enabled: enabled.has(tool.name) } : undefined);
			return `${tool.name}  [${status}]\n${formatToolDetails(tool, enabled ? { enabled: enabled.has(tool.name) } : undefined)}`;
		})
		.join("\n\n---\n\n");
}

/**
 * Names saved in `.pi/tools.json` that this session does not register. They are
 * kept on disk by a save but cannot take effect here, so they are reported
 * instead of being presented as ordinary tools.
 */
export function formatUnavailableSaved(names: string[]): string {
	if (names.length === 0) {
		return "";
	}
	const header = `Saved but not registered in this session (kept by save, not applied):`;
	return [header, ...names.map((name) => `  - ${name}`)].join("\n");
}
