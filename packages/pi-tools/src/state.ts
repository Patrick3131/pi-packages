/**
 * Decide which tools should be enabled.
 *
 * Saved snapshots are honored for tools that were known when they were written.
 * Tools that appear later default to enabled. That keeps late registrations
 * (Grok adapter tools, /reload, package tools) from being treated as disabled
 * just because they were missing from tools-config.
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
