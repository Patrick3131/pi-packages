export const PRESET_STATE_ENTRY_TYPE = "preset-state";

/** Structural view of the session entries these helpers read. */
export interface SessionEntryCarrier {
	type?: unknown;
	customType?: unknown;
	data?: unknown;
	message?: unknown;
}

/**
 * Detect whether a job preset is currently driving this session.
 *
 * `pi-presets` records its active preset as a `preset-state` custom entry every
 * time it applies or clears one, so the newest such entry on the current branch
 * is authoritative and an explicit `{ name: null }` means no preset is active.
 * Either signal is a stronger statement of intent than `.pi/tools.json`, which
 * only describes the resting state of a repository.
 */
export function activePresetName(options: { entries?: readonly SessionEntryCarrier[] }): string | undefined {
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
 * Whether the transcript already declares the tools this session runs with.
 *
 * A resumed, forked, or reloaded session carries the loadout its own history
 * chose, and `session_start` fires again for every one of those. Applying
 * project defaults then would replace a session's accepted selection with the
 * file, so a declared loadout is treated as the owner instead.
 */
export function declaresToolLoadout(entries: readonly SessionEntryCarrier[]): boolean {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "message") {
			continue;
		}
		const message = entry.message as { role?: unknown; toolsAdded?: unknown } | undefined;
		if (message?.role !== "system") {
			continue;
		}
		return Array.isArray(message.toolsAdded) && message.toolsAdded.length > 0;
	}
	return false;
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
