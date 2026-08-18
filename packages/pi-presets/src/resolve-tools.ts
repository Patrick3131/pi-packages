/**
 * Map preset tool names onto the live Pi registry.
 *
 * Grok adapters register as xai_grok_* and auto-enable for xai-auth. Job
 * presets usually list the public names (read_file) or the Pi builtins
 * (read / bash). Without this mapping, setActiveTools drops the adapters
 * and every new Melon session looks like Grok tools are off.
 *
 * Network extras (web_search, image gen, multi-agent) stay opt-in.
 */

const GROK_PUBLIC_TO_DISPATCH: Record<string, string> = {
	read_file: "xai_grok_read_file",
	search_replace: "xai_grok_search_replace",
	list_dir: "xai_grok_list_dir",
	run_terminal_command: "xai_grok_run_terminal_command",
};

const CAPABILITY_TO_GROK_ADAPTER: Record<string, string> = {
	read: "xai_grok_read_file",
	read_file: "xai_grok_read_file",
	xai_grok_read_file: "xai_grok_read_file",
	edit: "xai_grok_search_replace",
	write: "xai_grok_search_replace",
	search_replace: "xai_grok_search_replace",
	xai_grok_search_replace: "xai_grok_search_replace",
	ls: "xai_grok_list_dir",
	list_dir: "xai_grok_list_dir",
	xai_grok_list_dir: "xai_grok_list_dir",
	grep: "xai_grok_grep",
	xai_grok_grep: "xai_grok_grep",
	bash: "xai_grok_run_terminal_command",
	run_terminal_command: "xai_grok_run_terminal_command",
	xai_grok_run_terminal_command: "xai_grok_run_terminal_command",
};

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
		const mapped = GROK_PUBLIC_TO_DISPATCH[name];
		if (mapped && known.has(mapped)) {
			resolved.add(mapped);
			continue;
		}
		unknown.push(name);
	}

	for (const name of options.requested) {
		const adapter = CAPABILITY_TO_GROK_ADAPTER[name];
		if (adapter && known.has(adapter)) {
			resolved.add(adapter);
		}
	}

	return { valid: [...resolved], unknown };
}
