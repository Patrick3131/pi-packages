import type { PickerItem } from "../../shared/searchable-picker.js";
import {
	formatToolDetails,
	formatToolSummary,
	isDeclaredSwitch,
	isIndirectlyReachable,
	type ToolLike,
} from "./format.js";

export const INDIRECT_SECTION_VALUE = "__indirect_tools__";
export const INDIRECT_SECTION_LABEL = "Reachable via tool_search / codemode";

export interface ToolPickerRowsOptions {
	enabledTools: ReadonlySet<string>;
	detailsMode?: boolean;
}

/** The one-line preview or expanded details for a tool row. */
export function formatPickerToolDescription(tool: ToolLike, options: ToolPickerRowsOptions): string {
	return options.detailsMode
		? formatToolDetails(tool, { enabled: options.enabledTools.has(tool.name) })
		: formatToolSummary(tool);
}

/**
 * Build the picker rows from Pi's catalog.
 *
 * Declared-switch tools are the only rows with a working on/off decision.
 * `deferred` and `codemode` tools are reachable without being declared, so they
 * appear in a read-only section: the overview is complete, but Enter/Space
 * cannot promise a toggle Pi would ignore. Hidden tools are omitted entirely;
 * the picker subtitle reports how many were left out.
 */
export function buildToolPickerRows(
	tools: readonly ToolLike[],
	options: ToolPickerRowsOptions,
): PickerItem[] {
	const rows: PickerItem[] = tools
		.filter(isDeclaredSwitch)
		.map((tool) => ({
			value: tool.name,
			label: tool.name,
			description: formatPickerToolDescription(tool, options),
			current: options.enabledTools.has(tool.name),
		}));

	const indirect = tools.filter(isIndirectlyReachable);
	if (indirect.length === 0) {
		return rows;
	}

	rows.push({
		value: INDIRECT_SECTION_VALUE,
		label: INDIRECT_SECTION_LABEL,
		kind: "header",
	});
	for (const tool of indirect) {
		rows.push({
			value: tool.name,
			label: tool.name,
			badge: tool.exposure ?? "indirect",
			description: formatPickerToolDescription(tool, options),
			selectable: false,
		});
	}
	return rows;
}
