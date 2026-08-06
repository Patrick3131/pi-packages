import type { WorkFrontmatter, WorkType } from "./types.js";

export interface ParsedMarkdown {
  frontmatter: WorkFrontmatter;
  body: string;
  title?: string;
  type?: WorkType;
  preview: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal YAML-ish frontmatter parser for simple key: value pairs.
 * Does not support nested structures; unknown lines are ignored.
 */
export function parseFrontmatter(raw: string): { frontmatter: WorkFrontmatter; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter: WorkFrontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] ?? "" };
}

export function extractTitle(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return undefined;
}

export function extractType(body: string): WorkType | undefined {
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Type\s*$/i.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (!t) continue;
        if (t.startsWith("#")) break;
        return t.replace(/^[-*]\s+/, "").trim();
      }
    }
  }
  return undefined;
}

export function buildPreview(body: string, maxLines = 12): string {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => {
      // drop leading empty lines
      if (l.trim()) return true;
      return arr.slice(0, idx).some((x) => x.trim());
    });

  // Skip the H1 title line for preview body
  let start = 0;
  if (lines[0] && /^#\s+/.test(lines[0])) start = 1;

  const slice = lines.slice(start).filter((l) => l.trim()).slice(0, maxLines);
  return slice.join("\n");
}

export function parseMarkdown(raw: string): ParsedMarkdown {
  const { frontmatter, body } = parseFrontmatter(raw);
  const title = extractTitle(body);
  const type = extractType(body);
  const preview = buildPreview(body);
  return { frontmatter, body, title, type, preview };
}

/** Companion suffixes (checked longest-first). */
const COMPANION_SUFFIXES = [
  { suffix: "-to-do-list", kind: "todo" as const },
  { suffix: "-todo-list", kind: "todo" as const },
  { suffix: "-test", kind: "test" as const },
];

/**
 * Split a markdown basename (no extension) into package base + companion kind.
 * e.g. 2026-08-04-feature-foo-to-do-list -> { baseName, kind: "todo" }
 */
export function classifyBasename(basename: string): {
  baseName: string;
  kind: "primary" | "todo" | "test";
} {
  for (const { suffix, kind } of COMPANION_SUFFIXES) {
    if (basename.endsWith(suffix) && basename.length > suffix.length) {
      return { baseName: basename.slice(0, -suffix.length), kind };
    }
  }
  return { baseName: basename, kind: "primary" };
}

/** Extract leading YYYY-MM-DD from a base name if present. */
export function extractDateFromBaseName(baseName: string): string | undefined {
  const m = baseName.match(/^(\d{4}-\d{2}-\d{2})(?:-|$)/);
  return m?.[1];
}

/** Infer type token from basename when ## Type is missing. */
export function inferTypeFromBaseName(baseName: string): WorkType | undefined {
  // strip date prefix
  const withoutDate = baseName.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const known = ["triage", "bug", "technical", "view", "feature", "epic", "idea"];
  for (const t of known) {
    if (withoutDate === t || withoutDate.startsWith(`${t}-`)) return t;
  }
  return undefined;
}
