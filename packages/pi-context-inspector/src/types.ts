import type { BasePromptTraceResult } from "./base-trace/index.js";

export type DiagnosticLevel = "info" | "warning" | "error";

export interface ReportDiagnostic {
  level: DiagnosticLevel;
  message: string;
  source?: string;
}

export interface ReportChildSection {
  id: string;
  label: string;
  chars: number;
  tokens: number;
  content?: string;
  sourcePath?: string;
}

export interface ReportSection {
  id: string;
  kind:
    | "base"
    | "system-append"
    | "agents"
    | "skills"
    | "metadata"
    | "tools"
    | "other";
  label: string;
  chars: number;
  tokens: number;
  content?: string;
  percentageOfPrompt?: number;
  children?: ReportChildSection[];
}

export interface SkillReport {
  name: string;
  description: string;
  location: string;
  chars: number;
  tokens: number;
}

export interface ParsedPrompt {
  sections: ReportSection[];
  totalChars: number;
  totalTokens: number;
  skills: SkillReport[];
}

export interface SourceFileRecord {
  path: string;
  scope: "global" | "project";
  role: "system" | "append-system" | "agents";
  exists: boolean;
  readable: boolean;
  includedInPrompt?: boolean;
  chars?: number;
  tokens?: number;
  content?: string;
  diagnostics?: string[];
}

export interface DiscoveredPromptPaths {
  agentDir: string;
  globalSystemPath: string;
  globalAppendSystemPath: string;
  globalAgentsPath: string;
  projectSystemPath: string;
  projectAppendSystemPath: string;
  discoveredAgentsPaths: string[];
}

export interface ToolDefinitionReport {
  name: string;
  description: string;
  parameters: unknown;
  serialized: string;
  chars: number;
  tokens: number;
}

export interface ToolDefinitionsSummary {
  count: number;
  totalChars: number;
  totalTokens: number;
  items: ToolDefinitionReport[];
}

export interface ContextInspectionReport {
  meta: {
    generatedAt: string;
    reportId: string;
    cwd: string;
    agentDir: string;
    modelId?: string;
    contextWindow?: number;
    usedContextTokens?: number;
    remainingContextTokens?: number;
  };
  prompt: {
    effective: string;
    totalChars: number;
    totalTokens: number;
    sections: ReportSection[];
  };
  files: {
    system: SourceFileRecord[];
    appendSystem: SourceFileRecord[];
    agents: SourceFileRecord[];
  };
  tools: ToolDefinitionsSummary;
  skills: {
    count: number;
    totalTokens: number;
    items: SkillReport[];
  };
  trace?: BasePromptTraceResult;
  diagnostics: ReportDiagnostic[];
}
