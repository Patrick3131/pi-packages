/**
 * Map preset tool names onto the live Pi registry.
 *
 * A preset lists tool names; only the ones the current session actually
 * registered can be activated. Anything else is reported back so
 * `/preset` can tell the user which names are unavailable instead of
 * silently activating a smaller set.
 */

export function resolvePresetToolNames(options: {
	requested: string[];
	allToolNames: string[];
}): { valid: string[]; unknown: string[] } {
	const known = new Set(options.allToolNames);
	const resolved = new Set<string>();
	const unknown: string[] = [];

	for (const name of options.requested) {
		if (known.has(name)) {
			resolved.add(name);
			continue;
		}
		if (!unknown.includes(name)) {
			unknown.push(name);
		}
	}

	return { valid: [...resolved], unknown };
}
