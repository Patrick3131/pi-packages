import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Crawl4AIJsonConfig } from "./types";

const CONFIG_FILENAMES = ["crawl4ai.json", ".crawl4ai.json"];

export function findConfigFile(cwd?: string): string | null {
  const baseDir = cwd || process.cwd();
  const searchDirs = [
    baseDir,
    join(baseDir, ".pi"),
    join(homedir(), ".pi", "agent", "extensions"),
  ];

  for (const dir of searchDirs) {
    for (const filename of CONFIG_FILENAMES) {
      const filepath = join(dir, filename);
      if (existsSync(filepath)) return filepath;
    }
  }

  return null;
}

export function loadJsonConfig(filepath: string): Crawl4AIJsonConfig | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content) as Crawl4AIJsonConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[pi-crawl4ai] Failed to load config from ${filepath}: ${message}`);
    return null;
  }
}
