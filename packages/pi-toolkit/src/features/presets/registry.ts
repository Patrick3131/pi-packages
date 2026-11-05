/**
 * Narrow bridge for applying a preset from another pi-toolkit feature.
 *
 * Feature entry points are independently removable, so `inline-actions` must
 * not import the presets implementation. The preset extension publishes a
 * runtime object here on load and clears it on shutdown; a lookup returning
 * undefined simply means the preset feature is not loaded in this session.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface PresetRuntime {
	/** Preset names from the merged global and project config. */
	names(): string[];
	/** Apply a preset. False when the name is unknown or nothing was applied. */
	apply(name: string, ctx: ExtensionContext): Promise<boolean>;
}

let runtime: PresetRuntime | undefined;

export function setPresetRuntime(next: PresetRuntime | undefined): void {
	runtime = next;
}

export function getPresetRuntime(): PresetRuntime | undefined {
	return runtime;
}
