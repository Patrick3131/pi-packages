/** Native MCP permissions. Restore installs this standalone personal extension. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Access = "read" | "write";
export type McpPolicy = Record<string, Access>;

export function parseMcpPolicy(text: string): McpPolicy {
	const value: unknown = JSON.parse(text);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected MCP policy object");
	const presets = (value as { presets?: unknown }).presets;
	if (!presets || typeof presets !== "object" || Array.isArray(presets)) throw new Error("Expected presets object");
	for (const [name, access] of Object.entries(presets)) {
		if (!name.trim() || (access !== "read" && access !== "write")) throw new Error("Invalid MCP preset access");
	}
	return presets as McpPolicy;
}

export function activePreset(entries: readonly { type?: unknown; customType?: unknown; data?: unknown }[]): string | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry?.type !== "custom" || entry.customType !== "preset-state") continue;
		const name = (entry.data as { name?: unknown } | undefined)?.name;
		return typeof name === "string" ? name : undefined;
	}
	return undefined;
}

export function isMcpTool(name: string): boolean {
	return name.startsWith("mcp__") || ["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"].includes(name);
}

export default function mcpPolicy(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (!isMcpTool(event.toolName)) return;
		let policy: McpPolicy;
		try {
			policy = parseMcpPolicy(readFileSync(join(ctx.cwd, ".pi", "mcp-policy.json"), "utf8"));
		} catch {
			return { block: true, reason: "MCP requires a valid project .pi/mcp-policy.json." };
		}
		const preset = activePreset(ctx.sessionManager.getBranch());
		const access = preset && Object.hasOwn(policy, preset) ? policy[preset] : undefined;
		if (!access) return { block: true, reason: "This preset does not allow MCP." };
		const resource = !event.toolName.startsWith("mcp__");
		const readOnly = resource || pi.getAllTools().find(tool => tool.name === event.toolName)?.annotations?.readOnlyHint === true;
		if (readOnly) return;
		if (access !== "write") return { block: true, reason: "This preset allows read-only MCP calls." };
		if (!ctx.hasUI) return { block: true, reason: "MCP writes require interactive confirmation." };
		if (!await ctx.ui.confirm("Allow MCP write?", `${event.toolName}\n${JSON.stringify(event.input)}`)) {
			return { block: true, reason: "MCP write was not approved." };
		}
	});
}
