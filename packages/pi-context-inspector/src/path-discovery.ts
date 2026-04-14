import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { DiscoveredPromptPaths } from "./types.js";

function expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    return path.resolve(expandHome(envDir));
  }
  return path.join(os.homedir(), ".pi", "agent");
}

function walkAncestorAgentsPaths(startDir: string): string[] {
  const results: string[] = [];
  let current = path.resolve(startDir);

  for (;;) {
    results.push(path.join(current, "AGENTS.md"));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return results;
}

function uniqueExisting(paths: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const candidate of paths) {
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    if (fs.existsSync(normalized)) {
      results.push(normalized);
    }
  }

  return results;
}

export function discoverPromptPaths(cwd: string): DiscoveredPromptPaths {
  const agentDir = getAgentDir();
  const resolvedCwd = path.resolve(cwd);

  const globalSystemPath = path.join(agentDir, "SYSTEM.md");
  const globalAppendSystemPath = path.join(agentDir, "APPEND_SYSTEM.md");
  const globalAgentsPath = path.join(agentDir, "AGENTS.md");
  const projectSystemPath = path.join(resolvedCwd, ".pi", "SYSTEM.md");
  const projectAppendSystemPath = path.join(resolvedCwd, ".pi", "APPEND_SYSTEM.md");

  const discoveredAgentsPaths = uniqueExisting([
    globalAgentsPath,
    ...walkAncestorAgentsPaths(resolvedCwd),
  ]);

  return {
    agentDir,
    globalSystemPath,
    globalAppendSystemPath,
    globalAgentsPath,
    projectSystemPath,
    projectAppendSystemPath,
    discoveredAgentsPaths,
  };
}
