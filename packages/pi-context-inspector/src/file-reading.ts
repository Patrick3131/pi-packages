import * as fs from "node:fs";

import { estimateTokens } from "./parser.js";
import type {
  DiscoveredPromptPaths,
  ReportDiagnostic,
  SourceFileRecord,
} from "./types.js";

function readFileRecord(
  filePath: string,
  scope: SourceFileRecord["scope"],
  role: SourceFileRecord["role"],
  diagnostics: ReportDiagnostic[]
): SourceFileRecord {
  const exists = fs.existsSync(filePath);
  if (!exists) {
    return {
      path: filePath,
      scope,
      role,
      exists: false,
      readable: false,
      diagnostics: ["Not present"],
    };
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return {
      path: filePath,
      scope,
      role,
      exists: true,
      readable: true,
      content,
      chars: content.length,
      tokens: estimateTokens(content),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({
      level: "warning",
      source: filePath,
      message: `Failed to read file: ${message}`,
    });
    return {
      path: filePath,
      scope,
      role,
      exists: true,
      readable: false,
      diagnostics: [message],
    };
  }
}

export function readDiscoveredPromptFiles(
  paths: DiscoveredPromptPaths,
  diagnostics: ReportDiagnostic[]
): {
  system: SourceFileRecord[];
  appendSystem: SourceFileRecord[];
  agents: SourceFileRecord[];
} {
  return {
    system: [
      readFileRecord(paths.globalSystemPath, "global", "system", diagnostics),
      readFileRecord(paths.projectSystemPath, "project", "system", diagnostics),
    ],
    appendSystem: [
      readFileRecord(
        paths.globalAppendSystemPath,
        "global",
        "append-system",
        diagnostics
      ),
      readFileRecord(
        paths.projectAppendSystemPath,
        "project",
        "append-system",
        diagnostics
      ),
    ],
    agents: paths.discoveredAgentsPaths.map((agentsPath) =>
      readFileRecord(
        agentsPath,
        agentsPath === paths.globalAgentsPath ? "global" : "project",
        "agents",
        diagnostics
      )
    ),
  };
}
