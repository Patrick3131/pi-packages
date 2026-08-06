import * as fs from "node:fs";
import * as path from "node:path";

import type { WorkConfig } from "./types.js";

const DEFAULT_ROOT = "docs/work";
const DEFAULT_OPEN = "work";
const DEFAULT_FINISHED = "finished";

export interface ResolveConfigInput {
  cwd: string;
  /** Override root relative to cwd or absolute. */
  root?: string;
  openDir?: string;
  finishedDir?: string;
  /** Optional env map (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Resolve work-doc configuration.
 *
 * Priority for root:
 * 1. explicit options
 * 2. PI_WORK_ROOT env
 * 3. default docs/work
 */
export function resolveWorkConfig(input: ResolveConfigInput): WorkConfig {
  const env = input.env ?? process.env;
  const cwd = path.resolve(input.cwd);

  const rootRelOrAbs = firstNonEmpty(input.root, env.PI_WORK_ROOT) ?? DEFAULT_ROOT;
  const openDir = firstNonEmpty(input.openDir, env.PI_WORK_OPEN_DIR) ?? DEFAULT_OPEN;
  const finishedDir = firstNonEmpty(input.finishedDir, env.PI_WORK_FINISHED_DIR) ?? DEFAULT_FINISHED;

  const rootAbs = path.isAbsolute(rootRelOrAbs) ? rootRelOrAbs : path.resolve(cwd, rootRelOrAbs);
  const root = path.isAbsolute(rootRelOrAbs) ? path.relative(cwd, rootAbs) || rootRelOrAbs : rootRelOrAbs;

  return {
    cwd,
    root,
    openDir,
    finishedDir,
    rootAbs,
    openAbs: path.join(rootAbs, openDir),
    finishedAbs: path.join(rootAbs, finishedDir),
  };
}

export function workStructureExists(config: WorkConfig): boolean {
  return fs.existsSync(config.rootAbs) && fs.statSync(config.rootAbs).isDirectory();
}

export function openDirExists(config: WorkConfig): boolean {
  return fs.existsSync(config.openAbs) && fs.statSync(config.openAbs).isDirectory();
}

export function finishedDirExists(config: WorkConfig): boolean {
  return fs.existsSync(config.finishedAbs) && fs.statSync(config.finishedAbs).isDirectory();
}

export { DEFAULT_ROOT, DEFAULT_OPEN, DEFAULT_FINISHED };
