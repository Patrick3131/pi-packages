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
	if (options?.enabled !== undefined) {
		lines.push(options.enabled ? "status: enabled" : "status: disabled");
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
			const header = enabled ? `${tool.name}  [${enabled.has(tool.name) ? "enabled" : "disabled"}]` : tool.name;
			return `${header}\n${formatToolDetails(tool, enabled ? { enabled: enabled.has(tool.name) } : undefined)}`;
		})
		.join("\n\n---\n\n");
}
