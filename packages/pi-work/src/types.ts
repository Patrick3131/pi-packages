/** Frontmatter status values used by work-item docs. */
export type WorkStatus = "idea" | "backlog" | "in_progress" | "done" | "obsolete" | string;

/** Work-item type labels (freeform but commonly used values listed). */
export type WorkType =
  | "triage"
  | "bug"
  | "technical"
  | "view"
  | "feature"
  | "epic"
  | "idea"
  | string;

export interface WorkFrontmatter {
  status?: WorkStatus;
  owner?: string;
  last_reviewed?: string;
  canonical_ref?: string;
  [key: string]: unknown;
}

/** One markdown file that is part of a work package. */
export interface WorkFile {
  path: string;
  relativePath: string;
  kind: "primary" | "todo" | "test" | "other";
  title?: string;
  frontmatter: WorkFrontmatter;
  /** First non-empty body lines for previews. */
  preview: string;
  mtimeMs: number;
}

/**
 * A work package is the unit of work: primary doc + optional companions.
 * Companions share the same dated base name with `-to-do-list` / `-test` suffixes.
 */
export interface WorkPackage {
  /** Base slug without companion suffixes, e.g. 2026-08-04-feature-foo */
  baseName: string;
  /** Display title from primary (or first available) doc. */
  title: string;
  status: WorkStatus;
  type?: WorkType;
  date?: string;
  lifecycle: "open" | "finished";
  dir: string;
  primary?: WorkFile;
  todo?: WorkFile;
  test?: WorkFile;
  others: WorkFile[];
  /** All files in the package. */
  files: WorkFile[];
  mtimeMs: number;
}

export interface WorkConfig {
  /** Absolute project cwd. */
  cwd: string;
  /** Relative work root, default docs/work. */
  root: string;
  /** Relative open dir under root, default work. */
  openDir: string;
  /** Relative finished dir under root, default finished. */
  finishedDir: string;
  /** Absolute path to work root. */
  rootAbs: string;
  /** Absolute path to open work dir. */
  openAbs: string;
  /** Absolute path to finished work dir. */
  finishedAbs: string;
}

export type LifecycleFilter = "open" | "finished" | "all";

export interface DiscoverOptions {
  lifecycle?: LifecycleFilter;
  /** Case-insensitive filter against title, baseName, type, status. */
  query?: string;
}
