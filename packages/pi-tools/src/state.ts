export const PRESET_STATE_ENTRY_TYPE = "preset-state";

/** Structural view of the session entries we read. */
export interface PresetStateCarrier {
	type?: unknown;
	customType?: unknown;
	data?: unknown;
}

/**
 * Detect whether a job preset is currently driving this session.
 *
 * `pi-presets` records its active preset as a `preset-state` custom entry every
 * time it applies or clears one, so the newest such entry is authoritative and
 * an explicit `{ name: null }` means no preset is active. Either signal is a
 * stronger statement of intent than `.pi/tools.json`, which only describes the
 * resting state of a repository.
 */
export function activePresetName(options: { entries?: readonly PresetStateCarrier[] }): string | undefined {
	const entries = options.entries ?? [];
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== PRESET_STATE_ENTRY_TYPE) {
			continue;
		}
		const name = (entry.data as { name?: unknown } | null | undefined)?.name;
		return typeof name === "string" && name.trim() ? name.trim() : undefined;
	}
	return undefined;
}

/**
 * Decide which tools should be enabled.
 *
 * Saved snapshots are honored for tools that were known when they were written.
 * Tools that appear later default to enabled. That keeps late registrations
 * (package tools, /reload re-registrations, provider adapters) from being
 * treated as disabled just because they were missing from tools-config.
 *
 * Older snapshots only stored enabledTools. Those names are treated as the
 * known set.
 */
export function resolveEnabledTools(options: {
	allToolNames: string[];
	activeTools: string[];
	savedTools?: string[];
	knownTools?: string[];
}): string[] {
	const known = new Set(options.allToolNames);
	const active = options.activeTools.filter((name) => known.has(name));

	if (!options.savedTools) {
		return unique(active.length > 0 ? active : options.allToolNames);
	}

	const knownAtSave = new Set(options.knownTools ?? options.savedTools);
	const enabled = new Set(options.savedTools.filter((name) => known.has(name)));
	for (const name of options.allToolNames) {
		if (!knownAtSave.has(name)) {
			enabled.add(name);
		}
	}
	// Live-active tools stay enabled. A tools-config snapshot may have been
	// written before an extension registered additional tools, and it must not
	// strip tools the session is currently running with.
	for (const name of active) {
		enabled.add(name);
	}
	return unique([...enabled]);
}

export function sameToolSet(left: Iterable<string>, right: Iterable<string>): boolean {
	const a = new Set(left);
	const b = new Set(right);
	if (a.size !== b.size) {
		return false;
	}
	for (const name of a) {
		if (!b.has(name)) {
			return false;
		}
	}
	return true;
}

function unique(names: string[]): string[] {
	return [...new Set(names)];
}
