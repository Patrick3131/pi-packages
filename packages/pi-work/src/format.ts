import type { WorkPackage } from "./types.js";
import { packageCompleteness } from "./discover.js";
import { assessReadiness, readinessMarker } from "./readiness.js";

export function formatPackageLabel(pkg: WorkPackage): string {
  const completeness = packageCompleteness(pkg);
  const marker = completeness.complete ? "●" : "○";
  const life = pkg.lifecycle === "finished" ? "fin" : "open";
  const status = pkg.status || "?";
  const type = pkg.type ? ` ${pkg.type}` : "";
  const date = pkg.date ? `${pkg.date} ` : "";
  const ready = readinessMarker(pkg);
  const readyTag =
    ready === "ready" ? " ready" : ready === "intake" ? " intake" : " blocked";
  return `${marker} [${life}/${status}]${type}${readyTag} ${date}${pkg.title}`;
}

export function formatPackageDetail(pkg: WorkPackage): string {
  const c = packageCompleteness(pkg);
  const readiness = assessReadiness(pkg);
  const lines: string[] = [
    `# ${pkg.title}`,
    "",
    `Base: ${pkg.baseName}`,
    `Lifecycle: ${pkg.lifecycle}`,
    `Status: ${pkg.status}`,
    `Type: ${pkg.type ?? "(unknown)"}`,
    `Date: ${pkg.date ?? "(none)"}`,
    `Complete package: ${c.complete ? "yes" : `no (missing: ${c.missing.join(", ")})`}`,
    `Implementation readiness: ${readiness.ready ? "READY" : readiness.level.toUpperCase()}`,
  ];

  if (readiness.reasons.length) {
    lines.push("Readiness issues:");
    for (const r of readiness.reasons) lines.push(`- ${r}`);
  }

  lines.push("", "Files:");

  if (pkg.primary) lines.push(`- primary: ${pkg.primary.relativePath}`);
  else lines.push("- primary: (missing)");
  if (pkg.todo) lines.push(`- to-do:   ${pkg.todo.relativePath}`);
  else lines.push("- to-do:   (missing)");
  if (pkg.test) lines.push(`- test:    ${pkg.test.relativePath}`);
  else lines.push("- test:    (missing)");
  for (const other of pkg.others) {
    lines.push(`- other:   ${other.relativePath}`);
  }

  const preview = pkg.primary?.preview || pkg.todo?.preview || pkg.test?.preview;
  if (preview) {
    lines.push("", "Preview:", "---", preview, "---");
  }

  return lines.join("\n");
}

export function formatPackageListHeader(count: number, lifecycle: string, query?: string): string {
  const q = query ? ` matching "${query}"` : "";
  return `${count} ${lifecycle} work package(s)${q}`;
}

/** Preferred type order for UI grouping (unknown types sort after, alpha). */
const TYPE_ORDER = [
  "feature",
  "bug",
  "technical",
  "view",
  "epic",
  "triage",
  "idea",
];

function typeSortKey(type: string | undefined): string {
  const t = (type ?? "unknown").toLowerCase();
  const idx = TYPE_ORDER.indexOf(t);
  if (idx === -1) return `zz:${t}`;
  return `${String(idx).padStart(2, "0")}:${t}`;
}

/**
 * Build select labels grouped by type for the UI only.
 * Disk layout stays flat — grouping is presentation.
 *
 * Header rows are not selectable packages; they are omitted from byLabel.
 */
export function formatSelectItems(
  packages: WorkPackage[],
  options: { groupByType?: boolean } = {}
): { labels: string[]; byLabel: Map<string, WorkPackage> } {
  const groupByType = options.groupByType ?? true;
  const byLabel = new Map<string, WorkPackage>();
  const labels: string[] = [];
  const seen = new Map<string, number>();

  const sorted = [...packages].sort((a, b) => {
    if (groupByType) {
      const tk = typeSortKey(a.type).localeCompare(typeSortKey(b.type));
      if (tk !== 0) return tk;
    }
    return b.mtimeMs - a.mtimeMs || b.baseName.localeCompare(a.baseName);
  });

  let lastTypeHeader: string | undefined;

  for (const pkg of sorted) {
    if (groupByType) {
      const typeKey = (pkg.type ?? "unknown").toLowerCase();
      if (typeKey !== lastTypeHeader) {
        labels.push(`--- ${typeKey} ---`);
        lastTypeHeader = typeKey;
      }
    }

    let label = formatPackageLabel(pkg);
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    if (n > 1) label = `${label} (${pkg.baseName})`;
    while (byLabel.has(label)) label = `${label}·`;
    byLabel.set(label, pkg);
    labels.push(label);
  }

  return { labels, byLabel };
}

export function shortPathList(pkg: WorkPackage): string {
  return [pkg.primary?.relativePath, pkg.todo?.relativePath, pkg.test?.relativePath]
    .filter(Boolean)
    .join("\n");
}

/** True if a select label is a type group header, not a package. */
export function isGroupHeaderLabel(label: string): boolean {
  return label.startsWith("--- ") && label.endsWith(" ---");
}
