#!/usr/bin/env node

// Global pi-subagents `worktreeSetupHook` for npm-workspace repositories.
//
// Configured once per machine in `~/.pi/agent/extensions/subagent/config.json`
// and restored from this snapshot, so every repository that launches
// `worktree: true` lanes gets working dependencies in the new worktree.
//
// A managed worktree is a clean checkout: it has no `node_modules`, so no lane
// inside it could run a test. This hook mirrors the main checkout's dependency
// tree into the worktree with symlinks, which is fast and keeps one physical
// install.
//
// The part that must not be got wrong: an npm workspace installs
// `node_modules/<package-name>` as a symlink into the main checkout. Mirroring
// that verbatim would make a lane resolve its own workspace dependencies from
// the main checkout, so tests would pass or fail against code the lane is not
// editing. Every workspace entry is therefore re-pointed into the worktree,
// while third-party dependencies keep pointing at the shared install.
//
// Two deliberate limits:
//   - Repositories without an npm `workspaces` field are mirrored entry by
//     entry, but an in-repo symlink whose name is not a known workspace is
//     skipped rather than followed. Missing dependencies fail loudly in the
//     lane; silently resolving to the main checkout does not.
//   - pnpm and Yarn PnP layouts are not detected, so they hit that same skip
//     rule. Add a layout-specific mapping before trusting one of them.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIRRORED_ROOT_DIRS = ["node_modules", ".turbo"];

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

// Reads the root `workspaces` globs (`apps/*`, `packages/*`) and maps each
// workspace package name to its repo-relative directory. A missing or
// non-workspace root manifest yields an empty map rather than an error.
export function readWorkspaceDirs(repoRoot) {
  const manifestPath = join(repoRoot, "package.json");
  if (!existsSync(manifestPath)) return new Map();

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const declared = manifest.workspaces;
  const patterns = Array.isArray(declared)
    ? declared
    : Array.isArray(declared?.packages)
      ? declared.packages
      : [];

  const byName = new Map();

  for (const pattern of patterns) {
    if (typeof pattern !== "string" || !pattern.endsWith("/*")) continue;

    const parentDir = pattern.slice(0, -2);
    const parentPath = join(repoRoot, parentDir);
    if (!existsSync(parentPath)) continue;

    for (const entry of readdirSync(parentPath)) {
      const manifestEntry = join(parentPath, entry, "package.json");
      if (!existsSync(manifestEntry)) continue;

      const name = JSON.parse(readFileSync(manifestEntry, "utf8")).name;
      if (name) byName.set(name, join(parentDir, entry));
    }
  }

  return byName;
}

// Lists the link names in one `node_modules` directory, expanding one level of
// scope (`@scope/name`) so each entry is a resolvable package name, and reports
// where each entry really lives.
export function listDependencyEntries(nodeModulesPath) {
  if (!existsSync(nodeModulesPath)) return [];

  const entries = [];

  const record = (name) => {
    const entryPath = join(nodeModulesPath, name);
    let realPath;
    try {
      realPath = realpathSync(entryPath);
    } catch {
      realPath = undefined;
    }
    const isLink = (() => {
      try {
        return lstatSync(entryPath).isSymbolicLink();
      } catch {
        return false;
      }
    })();

    entries.push({ name, realPath, isLink });
  };

  for (const entry of readdirSync(nodeModulesPath)) {
    if (entry.startsWith(".")) continue;

    const entryPath = join(nodeModulesPath, entry);
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(entryPath)) {
        if (!scoped.startsWith(".")) record(entry + "/" + scoped);
      }
      continue;
    }

    record(entry);
  }

  return entries;
}

function resolvesInsideRepo(entry, repoRoot) {
  if (!entry.realPath) return false;
  const root = resolve(repoRoot);
  return entry.realPath === root || entry.realPath.startsWith(root + sep);
}

// Pure planner. Workspace entries resolve inside the worktree; third-party
// entries resolve inside the source checkout; an in-repo link that is not a
// known workspace is skipped so it cannot silently bind a lane to the main
// checkout.
export function classifyEntries({
  entries,
  destinationModulesPath,
  sourceModulesPath,
  worktreePath,
  workspaceDirs,
  repoRoot,
}) {
  const links = [];
  const skipped = [];

  for (const entry of entries) {
    const workspaceDir = workspaceDirs.get(entry.name);

    if (workspaceDir) {
      links.push({
        linkPath: join(destinationModulesPath, entry.name),
        target: join(worktreePath, workspaceDir),
      });
      continue;
    }

    if (entry.isLink && resolvesInsideRepo(entry, repoRoot)) {
      skipped.push(entry.name);
      continue;
    }

    links.push({
      linkPath: join(destinationModulesPath, entry.name),
      target: join(sourceModulesPath, entry.name),
    });
  }

  return { links, skipped };
}

function applyLinks(links) {
  for (const { linkPath, target } of links) {
    if (pathExists(linkPath)) continue;

    mkdirSync(dirname(linkPath), { recursive: true });
    try {
      symlinkSync(target, linkPath, "dir");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`worktree setup could not link ${linkPath}: ${message}\n`);
    }
  }
}

function mirrorNodeModules({
  repoRoot,
  worktreePath,
  workspaceDirs,
  modulesRelDir,
}) {
  const sourceModulesPath = join(repoRoot, modulesRelDir);
  if (!existsSync(sourceModulesPath)) {
    return { relativeModulesDir: modulesRelDir, skipped: [] };
  }

  const destinationModulesPath = join(worktreePath, modulesRelDir);
  mkdirSync(destinationModulesPath, { recursive: true });

  const { links, skipped } = classifyEntries({
    entries: listDependencyEntries(sourceModulesPath),
    destinationModulesPath,
    sourceModulesPath,
    worktreePath,
    workspaceDirs,
    repoRoot,
  });

  applyLinks(links);

  // `.bin` is linked as one directory instead of hundreds of per-binary links,
  // so npm script lookups for `jest`, `turbo`, and friends still resolve.
  const sourceBin = join(sourceModulesPath, ".bin");
  if (existsSync(sourceBin)) {
    applyLinks([
      { linkPath: join(destinationModulesPath, ".bin"), target: sourceBin },
    ]);
  }

  return { relativeModulesDir: modulesRelDir, skipped };
}

export function setupWorktree({ repoRoot, worktreePath }) {
  const workspaceDirs = readWorkspaceDirs(repoRoot);
  const syntheticPaths = [];
  const skipped = [];

  const modulesDirs = [];
  if (existsSync(join(repoRoot, "node_modules"))) modulesDirs.push("node_modules");
  for (const workspaceDir of workspaceDirs.values()) {
    const modulesRelDir = join(workspaceDir, "node_modules");
    if (existsSync(join(repoRoot, modulesRelDir)))
      modulesDirs.push(modulesRelDir);
  }

  for (const modulesRelDir of modulesDirs) {
    const result = mirrorNodeModules({
      repoRoot,
      worktreePath,
      workspaceDirs,
      modulesRelDir,
    });

    if (existsSync(join(worktreePath, result.relativeModulesDir))) {
      syntheticPaths.push(result.relativeModulesDir);
    }
    skipped.push(...result.skipped);
  }

  for (const dir of MIRRORED_ROOT_DIRS) {
    if (dir === "node_modules") continue;

    const sourcePath = join(repoRoot, dir);
    const destinationPath = join(worktreePath, dir);
    if (!existsSync(sourcePath) || pathExists(destinationPath)) continue;

    symlinkSync(sourcePath, destinationPath, "dir");
    syntheticPaths.push(dir);
  }

  return { syntheticPaths, skipped };
}

function isDirectInvocation() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === resolve(fileURLToPath(import.meta.url));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (isDirectInvocation()) {
  const payload = JSON.parse(await readStdin());
  const repoRoot = resolve(payload.repoRoot);
  const worktreePath = resolve(payload.worktreePath);

  const result = setupWorktree({ repoRoot, worktreePath });

  if (result.skipped.length > 0) {
    process.stderr.write(
      `worktree setup skipped ${result.skipped.length} in-repo link(s) it could not map to a workspace: ${result.skipped.join(", ")}\n`,
    );
  }

  process.stdout.write(
    JSON.stringify({ syntheticPaths: result.syntheticPaths }),
  );
}
