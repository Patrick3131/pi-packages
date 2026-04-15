import type { BasePromptTraceResult } from "./base-trace/index.js";

export type DiagnosticLevel = "info" | "warning" | "error";
export type PayloadCaptureSource = "before_provider_request" | "memory" | "restored";
export type PayloadVisibility = "exact-payload" | "partial-payload" | "prompt-only-fallback";
export type NormalizationStatus = "full" | "partial" | "unknown";
export type ProviderFamily = "anthropic" | "openai-chat" | "openai-responses" | "gemini" | "unknown";

export type ProviderShapeCaveat =
  | "missing-raw-payload"
  | "unknown-provider-shape"
  | "system-in-message"
  | "top-level-system-missing"
  | "tools-provider-specific"
  | "multimodal-content-approximate"
  | "non-text-content-omitted"
  | "other-provider-fields-not-counted"
  | "payload-redacted"
  | "payload-truncated"
  | "session-persistence-best-effort";

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

export interface PromptAgentsFileBlock {
  path: string;
  rawBlock: string;
  bodyText: string;
  chars: number;
  tokens: number;
  children?: ReportChildSection[];
}

export interface ParsedPrompt {
  sections: ReportSection[];
  totalChars: number;
  totalTokens: number;
  skills: SkillReport[];
  agentsFiles: PromptAgentsFileBlock[];
}

export type AgentsCoverageStatus =
  | "full"
  | "partial"
  | "transformed"
  | "not-present"
  | "unable-to-determine";

export type AgentsCoverageEvidenceSource = "prompt" | "payload" | "mixed" | "none";

export interface AgentsCoverageComparison {
  found: boolean;
  sourceType: "prompt" | "payload";
  sourceLabel?: string;
  rawText?: string;
  normalizedText?: string;
  exactMatch?: boolean;
  normalizedMatch?: boolean;
  matchedChars?: number;
  matchedTokens?: number;
  totalChars?: number;
  totalTokens?: number;
  coveragePercent?: number;
  contiguousCoveragePercent?: number;
  missingExcerpt?: string;
  extraExcerpt?: string;
  ambiguousWithPaths?: string[];
}

export interface AgentsCoverageEvidence {
  prompt: boolean;
  payload: boolean;
  source: AgentsCoverageEvidenceSource;
}

export interface AgentsFileCoverage {
  path: string;
  discovered: boolean;
  readable: boolean;
  promptEvidence?: AgentsCoverageComparison;
  payloadEvidence?: AgentsCoverageComparison;
  evidence: AgentsCoverageEvidence;
  presentInVisiblePrompt: boolean;
  seenInCapturedPayload: boolean;
  coveragePercent?: number;
  matchedChars?: number;
  matchedTokens?: number;
  status: AgentsCoverageStatus;
  reason: string;
  notes?: string[];
  caveats?: string[];
  promptBlockText?: string;
  payloadEvidenceText?: string;
  normalizedDiskText?: string;
  missingFromPromptExcerpt?: string;
  extraInPromptExcerpt?: string;
}

export interface AgentsCoverageDiagnostic {
  level: DiagnosticLevel;
  path: string;
  message: string;
}

export interface AgentsCoverageSummary {
  totalDiscovered: number;
  readable: number;
  full: number;
  partial: number;
  transformed: number;
  notPresent: number;
  unableToDetermine: number;
  presentInVisiblePrompt: number;
  seenInCapturedPayload: number;
}

export interface AgentsCoverageAnalysis {
  summary: AgentsCoverageSummary;
  items: AgentsFileCoverage[];
  diagnostics: AgentsCoverageDiagnostic[];
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
  agentsCoverage?: AgentsFileCoverage;
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

export interface PayloadNormalizedSection {
  label: string;
  text: string;
  chars: number;
  tokens: number;
  raw?: unknown;
}

export interface PayloadNormalizedMessage {
  index: number;
  role: string;
  label: string;
  text: string;
  chars: number;
  tokens: number;
  raw?: unknown;
}

export interface PayloadNormalizedTool {
  index: number;
  name: string;
  description: string;
  serialized: string;
  chars: number;
  tokens: number;
  raw?: unknown;
}

export interface PayloadNormalizationResult {
  providerFamily: ProviderFamily;
  modelId?: string;
  status: NormalizationStatus;
  system: PayloadNormalizedSection[];
  messages: PayloadNormalizedMessage[];
  tools: PayloadNormalizedTool[];
  otherFields: PayloadNormalizedSection[];
  caveats: ProviderShapeCaveat[];
}

export interface PayloadAnalysisSectionSummary {
  label: string;
  count: number;
  chars: number;
  tokens: number;
}

export interface PayloadComparisonSummary {
  normalizedPayloadTokensEstimate: number;
  requestJsonTokensEstimate: number;
  requestJsonMinusNormalizedTokensEstimate: number;
  runtimeContextUsageTokens?: number;
  captureTimeContextUsageTokens?: number;
  runtimeMinusRequestJsonTokensEstimate?: number;
}

export interface PayloadAnalysisResult {
  normalizedPayloadCharsEstimate: number;
  normalizedPayloadTokensEstimate: number;
  requestJsonCharsEstimate: number;
  requestJsonTokensEstimate: number;
  requestJsonMinusNormalizedCharsEstimate: number;
  requestJsonMinusNormalizedTokensEstimate: number;
  sections: {
    system: PayloadAnalysisSectionSummary;
    messages: PayloadAnalysisSectionSummary;
    tools: PayloadAnalysisSectionSummary;
    otherFields: PayloadAnalysisSectionSummary;
  };
  comparison: PayloadComparisonSummary;
}

export interface PayloadCurrentContextSummary {
  bestAvailableView: "prompt-only" | "captured-payload";
  effectiveSystemPromptTokens: number;
  effectiveSystemPromptChars: number;
  normalizedPayloadSystemTokens?: number;
  normalizedPayloadSystemChars?: number;
  normalizedPayloadMessageCount?: number;
  normalizedPayloadMessageTokens?: number;
  normalizedPayloadToolCount?: number;
  normalizedPayloadToolTokens?: number;
  normalizedPayloadTokensEstimate?: number;
  requestJsonTokensEstimate?: number;
  runtimeContextUsageTokens?: number;
  contextWindow?: number;
  visibility: PayloadVisibility;
  normalizationStatus?: NormalizationStatus;
  summaryLines: string[];
  caveat?: string;
}

export interface PayloadCaptureManifest {
  version: 1;
  id: string;
  capturedAt: string;
  source: PayloadCaptureSource;
  cwd: string;
  sessionId?: string;
  sessionFile?: string;
  leafId?: string | null;
  providerFamily: ProviderFamily;
  modelId?: string;
  rawPayloadPath?: string;
  rawPayloadPreview?: string;
  persisted: boolean;
  visibility: PayloadVisibility;
  normalizationStatus: NormalizationStatus;
  serializedPayloadChars: number;
  serializedPayloadTokens: number;
  contextUsageTokens?: number;
  contextWindow?: number;
  caveats: ProviderShapeCaveat[];
}

export interface ModelSelectionRecord {
  version: 1;
  changedAt: string;
  source: "set" | "cycle" | "restore";
  modelId?: string;
  previousModelId?: string;
}

export interface PayloadCaptureState {
  captures: PayloadCaptureManifest[];
  modelSelections: ModelSelectionRecord[];
}

export interface LatestPayloadCaptureReport {
  available: boolean;
  visibility: PayloadVisibility;
  source: PayloadCaptureSource | "none";
  latestCapture?: PayloadCaptureManifest;
  rawPayload?: unknown;
  normalization?: PayloadNormalizationResult;
  analysis?: PayloadAnalysisResult;
  currentContextSummary: PayloadCurrentContextSummary;
  history: PayloadCaptureManifest[];
  modelHistory: ModelSelectionRecord[];
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
  agentsCoverage: AgentsCoverageAnalysis;
  tools: ToolDefinitionsSummary;
  skills: {
    count: number;
    totalTokens: number;
    items: SkillReport[];
  };
  payload: LatestPayloadCaptureReport;
  trace?: BasePromptTraceResult;
  diagnostics: ReportDiagnostic[];
}
