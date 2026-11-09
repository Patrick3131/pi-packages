/**
 * One searchable picker for every toolkit choice.
 *
 * `ctx.ui.select` is arrows-only, which is painful for a long tool or model
 * list. This builds the same single-select surface out of Pi's own TUI
 * primitives with a filter field on top: typing narrows by fuzzy match over
 * label, value and description, arrows move, Enter picks, Esc cancels.
 *
 * Every caller also needs a non-TUI answer. RPC clients show Pi's plain
 * selector; print and JSON modes have no dialog, so they resolve to "cancelled"
 * exactly like `ctx.ui.select` does there.
 */

import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Component, fuzzyFilter, Input, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";

export interface PickerItem {
	value: string;
	label: string;
	/** Extra line under the selected row; also searched. */
	description?: string;
	/** Short muted marker after the label, e.g. a source or a state. */
	badge?: string;
	/** Marks the row as currently active. */
	current?: boolean;
	/** Section heading: rendered, never navigated to or activated. */
	kind?: "header";
	/** Visible for overview but cannot be activated. Defaults to true. */
	selectable?: boolean;
}

/** One selectable view over the rows; `all` may omit `matches`. */
export interface PickerFilter {
	label: string;
	matches?: (item: PickerItem) => boolean;
}

export interface SearchablePickerOptions {
	title: string;
	subtitle?: string;
	items: readonly PickerItem[];
	/** Optional views cycled with Tab/Shift+Tab; the first is the default. */
	filters?: readonly PickerFilter[];
	/** Rows in the scroll window; the selection stays centred. Default 10. */
	maxVisible?: number;
	placeholder?: string;
	/** Toggle mode: Enter and Space activate without closing, Esc finishes. */
	onActivate?: (item: PickerItem) => void;
	/** Feature keys, tried before the filter consumes a printable character. */
	onKey?: (data: string, query: string) => boolean;
	/** Extra hint text after the key hints. */
	hint?: string;
}

const DEFAULT_MAX_VISIBLE = 10;

/** Text a row is matched against: what the user can see, plus its value. */
export function pickerItemText(item: PickerItem): string {
	return `${item.label} ${item.value} ${item.description ?? ""} ${item.badge ?? ""}`;
}

/** Rows for the query, best match first; an empty query keeps the caller's order. */
export function filterPickerItems(items: readonly PickerItem[], query: string): PickerItem[] {
	if (query.length === 0) {
		return [...items];
	}
	return fuzzyFilter(
		items.filter((item) => item.kind !== "header"),
		query,
		pickerItemText,
	);
}

function canActivate(item: PickerItem): boolean {
	return item.kind !== "header" && item.selectable !== false;
}

function isNavigable(item: PickerItem): boolean {
	return item.kind !== "header";
}

function nextNavigableIndex(items: readonly PickerItem[], index: number, delta: 1 | -1): number {
	for (let step = 0; step < items.length; step += 1) {
		index = (index + delta + items.length) % items.length;
		const item = items[index];
		if (item !== undefined && isNavigable(item)) {
			return index;
		}
	}
	return index;
}

function nearestNavigableIndex(items: readonly PickerItem[], index: number): number {
	if (items.length === 0) {
		return 0;
	}
	const start = Math.max(0, Math.min(index, items.length - 1));
	for (let step = 0; step < items.length; step += 1) {
		const forward = (start + step) % items.length;
		if (items[forward]?.kind !== "header") {
			return forward;
		}
		const backward = (start - step + items.length) % items.length;
		if (items[backward]?.kind !== "header") {
			return backward;
		}
	}
	return start;
}

/** Bounded scroll window that keeps `index` inside it. */
export function pickerWindow(length: number, index: number, maxVisible: number): { start: number; end: number } {
	const size = Math.max(1, Math.min(maxVisible, length));
	const start = Math.max(0, Math.min(index - Math.floor(size / 2), length - size));
	return { start, end: Math.min(start + size, length) };
}

export async function searchablePicker(
	ctx: ExtensionContext,
	options: SearchablePickerOptions,
): Promise<string | undefined> {
	if (ctx.mode !== "tui") {
		// Pi's plain selector round-trips through the client; keep labels unique.
		const defaultFilter = options.filters?.[0];
		const visible = defaultFilter?.matches ? options.items.filter(defaultFilter.matches) : options.items;
		const selectable = visible.filter(canActivate);
		const labels = selectable.map((item) => item.label);
		if (labels.length === 0) {
			return undefined;
		}
		const chosen = await ctx.ui.select(options.title, labels);
		return chosen === undefined ? undefined : selectable.find((item) => item.label === chosen)?.value;
	}

	const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) => {
		const maxVisible = Math.max(3, options.maxVisible ?? DEFAULT_MAX_VISIBLE);
		const input = new Input({
			placeholder: options.placeholder ?? "type to filter",
			placeholderStyle: (text) => theme.fg("dim", text),
		});
		input.focused = true;

		const filters = options.filters ?? [];
		let filterIndex = 0;

		function filterCandidates(): readonly PickerItem[] {
			const filter = filters[filterIndex];
			return filter?.matches ? options.items.filter(filter.matches) : options.items;
		}

		function applyView(query: string): PickerItem[] {
			return filterPickerItems(filterCandidates(), query);
		}

		function filterStatus(): string | undefined {
			return filters.length > 1 ? `tab filter: ${filters[filterIndex]?.label ?? ""}` : undefined;
		}

		let filtered = applyView("");
		let index = filtered.findIndex((item) => item.current === true && isNavigable(item));
		if (index < 0) {
			index = nearestNavigableIndex(filtered, 0);
		}

		const border = new DynamicBorder((text) => theme.fg("border", text));
		const title = new Text(theme.fg("accent", theme.bold(options.title)), 0, 0);
		const subtitle = options.subtitle ? new Text(theme.fg("muted", options.subtitle), 0, 0) : undefined;
		// Plain labels, not keybinding hints: those read a module-level theme singleton
		// that an extension module may not share with the running TUI.
		const hints = ["↑↓ move", options.onActivate ? "enter/space toggle" : "enter select"];
		hints.push(options.onActivate ? "esc done" : "esc cancel");
		if (options.hint) {
			hints.push(options.hint);
		}
		hints.push("type to filter");
		function footerText(): string {
			const status = filterStatus();
			return status ? `${hints.join("  ")}  ${status}` : hints.join("  ");
		}
		const footer = new Text(theme.fg("dim", footerText()), 0, 0);

		function refilter(query: string): void {
			const previous = filtered[index]?.value;
			filtered = applyView(query);
			const kept = filtered.findIndex((item) => item.value === previous && isNavigable(item));
			index = kept >= 0 ? kept : nearestNavigableIndex(filtered, Math.min(index, Math.max(0, filtered.length - 1)));
		}

		function cycleFilter(delta: 1 | -1): void {
			if (filters.length <= 1) {
				return;
			}
			const previous = filtered[index]?.value;
			filterIndex = (filterIndex + delta + filters.length) % filters.length;
			filtered = applyView(input.getValue());
			const kept = filtered.findIndex((item) => item.value === previous && isNavigable(item));
			index = kept >= 0 ? kept : nearestNavigableIndex(filtered, 0);
			footer.setText(theme.fg("dim", footerText()));
		}

		function rowLines(width: number): string[] {
			if (filtered.length === 0) {
				return [theme.fg("muted", "  nothing matches")];
			}
			const { start, end } = pickerWindow(filtered.length, index, maxVisible);
			const lines: string[] = [];
			for (let row = start; row < end; row += 1) {
				const item = filtered[row];
				if (item === undefined) {
					continue;
				}
				if (item.kind === "header") {
					lines.push(truncateToWidth(theme.fg("muted", `  ${item.label}`), width));
					continue;
				}
				const selected = row === index;
				const prefix = selected ? theme.fg("accent", "→ ") : "  ";
				const label = selected ? theme.fg("accent", item.label) : item.label;
				const badge = item.badge ? theme.fg("muted", ` [${item.badge}]`) : "";
				const check = item.current ? theme.fg("success", " ✓") : "";
				lines.push(truncateToWidth(`${prefix}${label}${badge}${check}`, width));
				if (selected && item.description) {
					lines.push(truncateToWidth(theme.fg("muted", `    ${item.description}`), width));
				}
			}
			if (start > 0 || end < filtered.length) {
				lines.push(theme.fg("dim", `  (${index + 1}/${filtered.length})`));
			}
			return lines;
		}

		const component: Component = {
			render(width: number): string[] {
				const lines = [...title.render(width), ...border.render(width)];
				if (subtitle) {
					lines.push(...subtitle.render(width));
				}
				lines.push(...input.render(width));
				lines.push(...rowLines(width));
				lines.push(...footer.render(width), ...border.render(width));
				return lines;
			},
			invalidate() {},
			handleInput(data: string) {
				if (keybindings.matches(data, "tui.select.up")) {
					if (filtered.length > 0) {
						index = nextNavigableIndex(filtered, index, -1);
					}
				} else if (keybindings.matches(data, "tui.select.down")) {
					if (filtered.length > 0) {
						index = nextNavigableIndex(filtered, index, 1);
					}
				} else if (keybindings.matches(data, "tui.select.confirm")) {
					const item = filtered[index];
					if (item !== undefined && canActivate(item)) {
						if (options.onActivate) {
							options.onActivate(item);
							refilter(input.getValue());
						} else {
							done(item.value);
							return;
						}
					}
				} else if (keybindings.matches(data, "tui.select.cancel")) {
					done(null);
					return;
				} else if (filters.length > 1 && (matchesKey(data, "tab") || matchesKey(data, "shift+tab"))) {
					cycleFilter(matchesKey(data, "shift+tab") ? -1 : 1);
					tui.requestRender();
					return;
				} else if (options.onActivate && matchesKey(data, "space") && input.getValue().length === 0) {
					// Space toggles while the filter is empty; otherwise it is a space in the query.
					const item = filtered[index];
					if (item !== undefined && canActivate(item)) {
						options.onActivate(item);
						refilter(input.getValue());
					}
				} else if (options.onKey?.(data, input.getValue()) === true) {
					// The feature handled it (details, save, ...).
				} else {
					input.handleInput(data);
					refilter(input.getValue());
				}
				tui.requestRender();
			},
		};
		return component;
	});

	return result ?? undefined;
}
