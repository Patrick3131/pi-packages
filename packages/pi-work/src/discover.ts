import * as fs from "node:fs";
import * as path from "node:path";

import type { WorkConfig, WorkFile, WorkPackage, DiscoverOptions, LifecycleFilter } from "./types.js";
import {
  classifyBasename,
  extractDateFromBaseName,
  inferTypeFromBaseName,
  parseMarkdown,
} from "./parse.js";

function isMarkdown(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".md");
}

function walkMarkdownFiles(dirAbs: string, baseAbs: string): string[] {
  if (!fs.existsSync(dirAbs)) return [];
  const out: string[] = [];

  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && isMarkdown(entry.name)) {
        // Skip root lifecycle guidance docs that are not work packages
        const rel = path.relative(baseAbs, full);
        const top = rel.split(path.sep)[0] ?? rel;
        if (
          current === baseAbs &&
          ["AGENTS.md", "CONTEXT.md", "README.md"].includes(entry.name)
        ) {
          continue;
        }
        // Also skip those names anywhere? Keep only at root of work root.
        void top;
        out.push(full);
      }
    }
  };

  walk(dirAbs);
  return out;
}

function loadWorkFile(absPath: string, cwd: string): WorkFile | null {
  let raw: string;
  let stat: fs.Stats;
  try {
    raw = fs.readFileSync(absPath, "utf8");
    stat = fs.statSync(absPath);
  } catch {
    return null;
  }

  const parsed = parseMarkdown(raw);
  const fileName = path.basename(absPath, path.extname(absPath));
  const { kind } = classifyBasename(fileName);

  return {
    path: absPath,
    relativePath: path.relative(cwd, absPath),
    kind,
    title: parsed.title,
    frontmatter: parsed.frontmatter,
    preview: parsed.preview,
    mtimeMs: stat.mtimeMs,
  };
}

function groupFiles(
  files: WorkFile[],
  lifecycle: "open" | "finished",
  dir: string,
  cwd: string
): WorkPackage[] {
  const groups = new Map<string, WorkFile[]>();

  for (const file of files) {
    const base = classifyBasename(path.basename(file.path, path.extname(file.path))).baseName;
    const list = groups.get(base) ?? [];
    list.push(file);
    groups.set(base, list);
  }

  const packages: WorkPackage[] = [];

  for (const [baseName, group] of groups) {
    const primary = group.find((f) => f.kind === "primary");
    const todo = group.find((f) => f.kind === "todo");
    const test = group.find((f) => f.kind === "test");
    const others = group.filter((f) => f.kind === "other");

    // Prefer primary for title/status/type; fall back to companions
    const titleSource = primary ?? todo ?? test ?? group[0];
    let title = titleSource?.title;
    if (!title && todo?.title) title = todo.title.replace(/\s+To-?Do\s*$/i, "").trim();
    if (!title && test?.title) title = test.title.replace(/\s+Test\s+Plan\s*$/i, "").trim();
    if (!title) title = baseName;

    // Re-parse primary (or first) for type from body if needed
    let type = inferTypeFromBaseName(baseName);
    let status = String(titleSource?.frontmatter.status ?? (lifecycle === "finished" ? "done" : "backlog"));
    let previewFile = primary ?? titleSource;

    if (primary) {
      try {
        const raw = fs.readFileSync(primary.path, "utf8");
        const parsed = parseMarkdown(raw);
        type = parsed.type ?? type;
        if (parsed.frontmatter.status) status = String(parsed.frontmatter.status);
      } catch {
        // keep inferred
      }
    }

    const mtimeMs = Math.max(...group.map((f) => f.mtimeMs), 0);

    packages.push({
      baseName,
      title,
      status,
      type,
      date: extractDateFromBaseName(baseName),
      lifecycle,
      dir,
      primary,
      todo,
      test,
      others,
      files: group,
      mtimeMs,
    });

    void cwd;
    void previewFile;
  }

  return packages;
}

function matchesQuery(pkg: WorkPackage, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    pkg.baseName,
    pkg.title,
    pkg.status,
    pkg.type ?? "",
    pkg.date ?? "",
    pkg.primary?.relativePath ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/**
 * Discover work packages under open and/or finished directories.
 * Groups companion files by shared base name.
 */
export function discoverWorkPackages(
  config: WorkConfig,
  options: DiscoverOptions = {}
): WorkPackage[] {
  const lifecycle: LifecycleFilter = options.lifecycle ?? "open";
  const packages: WorkPackage[] = [];

  if (lifecycle === "open" || lifecycle === "all") {
    const paths = walkMarkdownFiles(config.openAbs, config.rootAbs);
    const files = paths
      .map((p) => loadWorkFile(p, config.cwd))
      .filter((f): f is WorkFile => f !== null);
    packages.push(...groupFiles(files, "open", config.openAbs, config.cwd));
  }

  if (lifecycle === "finished" || lifecycle === "all") {
    const paths = walkMarkdownFiles(config.finishedAbs, config.rootAbs);
    const files = paths
      .map((p) => loadWorkFile(p, config.cwd))
      .filter((f): f is WorkFile => f !== null);
    packages.push(...groupFiles(files, "finished", config.finishedAbs, config.cwd));
  }

  let result = packages;
  if (options.query) {
    result = result.filter((p) => matchesQuery(p, options.query!));
  }

  // Newest first
  result.sort((a, b) => b.mtimeMs - a.mtimeMs || b.baseName.localeCompare(a.baseName));
  return result;
}

/** Resolve a package from an explicit path to any of its files. */
export function resolvePackageFromPath(config: WorkConfig, filePath: string): WorkPackage | null {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(config.cwd, filePath);
  if (!fs.existsSync(abs)) return null;

  const dir = path.dirname(abs);
  const lifecycle: "open" | "finished" =
    path.resolve(dir).startsWith(path.resolve(config.finishedAbs)) ? "finished" : "open";

  const paths = walkMarkdownFiles(dir, dir);
  const files = paths
    .map((p) => loadWorkFile(p, config.cwd))
    .filter((f): f is WorkFile => f !== null);

  // Also include siblings in parent topic folders only for same base
  const baseName = classifyBasename(path.basename(abs, path.extname(abs))).baseName;
  const packages = groupFiles(files, lifecycle, dir, config.cwd);
  return packages.find((p) => p.baseName === baseName) ?? null;
}

export function packageCompleteness(pkg: WorkPackage): {
  hasPrimary: boolean;
  hasTodo: boolean;
  hasTest: boolean;
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!pkg.primary) missing.push("primary");
  if (!pkg.todo) missing.push("to-do-list");
  if (!pkg.test) missing.push("test plan");
  return {
    hasPrimary: Boolean(pkg.primary),
    hasTodo: Boolean(pkg.todo),
    hasTest: Boolean(pkg.test),
    complete: missing.length === 0,
    missing,
  };
}
