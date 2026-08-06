import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { WorkConfig } from "./types.js";

function packageRootFromHere(): string {
  // src/scaffold.ts -> package root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

export function getScaffoldSourceDir(packageRoot = packageRootFromHere()): string {
  return path.join(packageRoot, "scaffold", "docs", "work");
}

export interface ScaffoldResult {
  created: string[];
  skipped: string[];
  rootAbs: string;
}

/**
 * Copy scaffold/docs/work into the project's configured work root.
 * Never overwrites existing files.
 */
export function initWorkScaffold(config: WorkConfig, packageRoot?: string): ScaffoldResult {
  const sourceRoot = getScaffoldSourceDir(packageRoot);
  const created: string[] = [];
  const skipped: string[] = [];

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Scaffold source not found: ${sourceRoot}`);
  }

  const copyRecursive = (src: string, dest: string) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
        created.push(dest);
      }
      for (const entry of fs.readdirSync(src)) {
        if (entry === ".gitkeep") {
          // ensure directory exists; optionally write gitkeep if empty dest had just been created
          const gitkeepDest = path.join(dest, entry);
          if (!fs.existsSync(gitkeepDest) && fs.readdirSync(dest).length === 0) {
            fs.writeFileSync(gitkeepDest, "", "utf8");
            created.push(gitkeepDest);
          }
          continue;
        }
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
      return;
    }

    if (fs.existsSync(dest)) {
      skipped.push(dest);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    created.push(dest);
  };

  copyRecursive(sourceRoot, config.rootAbs);

  // Ensure open/finished dirs exist even if scaffold listing is sparse
  for (const dir of [config.openAbs, config.finishedAbs]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }

  return { created, skipped, rootAbs: config.rootAbs };
}
