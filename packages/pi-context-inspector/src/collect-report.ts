import {
  discoverAndLoadExtensions,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import {
  attributeBasePrompt,
  extractBaseLines,
  extractContributions,
  type BasePromptTraceResult,
  type LoadedExtension,
} from "./base-trace/index.js";
import { analyzeAgentsCoverage } from "./agents-coverage.js";
import { readDiscoveredPromptFiles } from "./file-reading.js";
import { analyzeNormalizedPayload } from "./payload-analysis.js";
import {
  getPayloadCaptureState,
  getLatestPayloadCapture,
  loadRawPayload,
} from "./payload-capture-store.js";
import { buildToolDefinitionsSection, buildToolDefinitionsSummary, estimateTokens, parseSystemPrompt } from "./parser.js";
import { discoverPromptPaths } from "./path-discovery.js";
import { normalizeProviderPayload } from "./provider-normalization.js";
import type {
  ContextInspectionReport,
  LatestPayloadCaptureReport,
  PayloadCurrentContextSummary,
  ReportDiagnostic,
  SourceFileRecord,
} from "./types.js";

function createReportId(): string {
  return `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

function getModelId(ctx: ExtensionCommandContext): string | undefined {
  const model = (ctx as { model?: { id?: string; name?: string } }).model;
  return model?.id ?? model?.name;
}

function markSourceFileInclusion(
  files: { system: SourceFileRecord[]; appendSystem: SourceFileRecord[]; agents: SourceFileRecord[] },
  prompt: string,
  hasSystemAppendSection: boolean
): void {
  for (const file of files.system) {
    file.includedInPrompt = file.exists && hasSystemAppendSection;
  }
  for (const file of files.appendSystem) {
    file.includedInPrompt = file.exists && hasSystemAppendSection;
  }
  for (const file of files.agents) {
    file.includedInPrompt = file.exists && prompt.includes(`## ${file.path}`);
  }
}

async function collectBaseTrace(
  cwd: string,
  agentDir: string,
  basePromptText: string,
  diagnostics: ReportDiagnostic[]
): Promise<BasePromptTraceResult | undefined> {
  try {
    const settings = SettingsManager.create(cwd, agentDir);
    const configuredPaths = settings.getExtensionPaths();
    const { extensions, errors } = await discoverAndLoadExtensions(configuredPaths, cwd, agentDir);
    const contributions = extractContributions(extensions as unknown as LoadedExtension[]);
    const { toolLines, guidelineLines } = extractBaseLines(basePromptText);
    const baseTokens = estimateTokens(basePromptText);
    const { buckets, evidence } = attributeBasePrompt(
      toolLines,
      guidelineLines,
      contributions,
      baseTokens,
      estimateTokens
    );

    if (errors.length > 0) {
      for (const error of errors) {
        diagnostics.push({
          level: "warning",
          source: error.path,
          message: `Extension inspection error: ${error.error}`,
        });
      }
    }

    return {
      fingerprint: extensions.map((extension) => extension.path).sort().join("|"),
      generatedAt: new Date().toISOString(),
      baseTokens,
      buckets,
      evidence,
      errors: errors.map((error) => ({ source: error.path, message: error.error })),
    };
  } catch (error) {
    diagnostics.push({
      level: "warning",
      message: `Base prompt trace unavailable: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

function buildPromptOnlyContextSummary(
  effectivePrompt: string,
  usage: ReturnType<ExtensionCommandContext["getContextUsage"]>
): PayloadCurrentContextSummary {
  const effectiveSystemPromptTokens = estimateTokens(effectivePrompt);
  const summaryLines = [
    `Effective system prompt visible right now: ~${String(effectiveSystemPromptTokens)} tokens.`,
    usage?.tokens != null
      ? `Runtime context usage metadata currently reports ${String(usage.tokens)} tokens in use${usage.contextWindow ? ` of ${String(usage.contextWindow)}` : ""}.`
      : "Runtime context usage metadata is not currently available from ctx.getContextUsage().",
    "No provider request payload has been captured yet for this branch, so conversation/tool/request JSON details below are not available yet.",
  ];

  return {
    bestAvailableView: "prompt-only",
    effectiveSystemPromptTokens,
    effectiveSystemPromptChars: effectivePrompt.length,
    runtimeContextUsageTokens: usage?.tokens ?? undefined,
    contextWindow: usage?.contextWindow ?? undefined,
    visibility: "prompt-only-fallback",
    summaryLines,
    caveat:
      "Best available current context is prompt-only until a provider request payload is captured after the extension is loaded.",
  };
}

function buildCapturedContextSummary(
  effectivePrompt: string,
  payload: NonNullable<LatestPayloadCaptureReport["normalization"]>,
  analysis: NonNullable<LatestPayloadCaptureReport["analysis"]>,
  reportPayload: Pick<LatestPayloadCaptureReport, "visibility" | "latestCapture">,
  usage: ReturnType<ExtensionCommandContext["getContextUsage"]>
): PayloadCurrentContextSummary {
  const effectiveSystemPromptTokens = estimateTokens(effectivePrompt);
  const normalizedPayloadSystemTokens = payload.system.reduce((sum, item) => sum + item.tokens, 0);
  const normalizedPayloadSystemChars = payload.system.reduce((sum, item) => sum + item.chars, 0);
  const normalizedPayloadMessageTokens = payload.messages.reduce((sum, item) => sum + item.tokens, 0);
  const normalizedPayloadToolTokens = payload.tools.reduce((sum, item) => sum + item.tokens, 0);
  const summaryLines = [
    `Effective system prompt visible from ctx.getSystemPrompt(): ~${String(effectiveSystemPromptTokens)} tokens.`,
    `Latest normalized provider payload captured ${String(payload.system.length)} system/developer instruction block(s), ${String(payload.messages.length)} conversation message(s), and ${String(payload.tools.length)} tool definition block(s).`,
    `Latest normalized payload estimate: ~${String(analysis.normalizedPayloadTokensEstimate)} tokens. Captured request JSON estimate: ~${String(analysis.requestJsonTokensEstimate)} tokens.`,
    usage?.tokens != null
      ? `Runtime context usage currently reports ${String(usage.tokens)} tokens${usage.contextWindow ? ` of ${String(usage.contextWindow)}` : ""}.`
      : "Runtime context usage metadata is not currently available from ctx.getContextUsage().",
  ];

  let caveat: string | undefined;
  if (reportPayload.visibility !== "exact-payload" || payload.status !== "full") {
    caveat =
      "This summary is best-effort: the payload capture may be partial and normalization may omit provider-specific or non-text fields.";
  }

  return {
    bestAvailableView: "captured-payload",
    effectiveSystemPromptTokens,
    effectiveSystemPromptChars: effectivePrompt.length,
    normalizedPayloadSystemTokens,
    normalizedPayloadSystemChars,
    normalizedPayloadMessageCount: payload.messages.length,
    normalizedPayloadMessageTokens,
    normalizedPayloadToolCount: payload.tools.length,
    normalizedPayloadToolTokens,
    normalizedPayloadTokensEstimate: analysis.normalizedPayloadTokensEstimate,
    requestJsonTokensEstimate: analysis.requestJsonTokensEstimate,
    runtimeContextUsageTokens: usage?.tokens ?? undefined,
    contextWindow: usage?.contextWindow ?? reportPayload.latestCapture?.contextWindow,
    visibility: reportPayload.visibility,
    normalizationStatus: payload.status,
    summaryLines,
    caveat,
  };
}

function buildPayloadReport(
  ctx: ExtensionCommandContext,
  effectivePrompt: string,
  diagnostics: ReportDiagnostic[]
): LatestPayloadCaptureReport {
  const state = getPayloadCaptureState();
  const latestCapture = getLatestPayloadCapture();
  const usage = ctx.getContextUsage();

  if (!latestCapture) {
    diagnostics.push({
      level: "info",
      message:
        "No provider payload capture was available for the current branch. This report is using prompt-derived analysis only. Trigger at least one model turn after loading the extension to capture the provider request payload.",
    });
    diagnostics.push({
      level: "info",
      message:
        "If before_provider_request does not expose enough request detail for your provider, pair this package with pi-llm-debugging for deeper raw request logging.",
    });
    return {
      available: false,
      visibility: "prompt-only-fallback",
      source: "none",
      currentContextSummary: buildPromptOnlyContextSummary(effectivePrompt, usage),
      history: state.captures,
      modelHistory: state.modelSelections,
    };
  }

  const rawPayload = loadRawPayload(latestCapture);
  const normalization = normalizeProviderPayload(rawPayload);
  const analysis = analyzeNormalizedPayload(normalization, rawPayload, {
    reportContextUsageTokens: usage?.tokens ?? undefined,
    captureContextUsageTokens: latestCapture.contextUsageTokens,
  });

  if (normalization.status !== "full") {
    diagnostics.push({
      level: "warning",
      message:
        `Provider payload normalization is ${normalization.status}. Some provider-specific fields may be partially mapped into normalized system, conversation, tools, or unclassified request JSON buckets.`,
    });
  }

  if (usage?.tokens != null) {
    const delta = usage.tokens - analysis.requestJsonTokensEstimate;
    diagnostics.push({
      level: Math.abs(delta) > 512 ? "warning" : "info",
      message:
        `Payload comparison: normalized payload ~${String(analysis.normalizedPayloadTokensEstimate)} tokens, captured request JSON ~${String(analysis.requestJsonTokensEstimate)} tokens, ctx.getContextUsage() reports ${String(usage.tokens)} tokens, runtime-vs-request delta ${delta >= 0 ? "+" : ""}${String(delta)}. Differences can come from provider framing, hidden/default fields, estimator mismatch, cached/session accounting, or context that is not visible in serialized request JSON.`,
    });
  }

  return {
    available: true,
    visibility: latestCapture.visibility,
    source: latestCapture.source,
    latestCapture,
    rawPayload,
    normalization,
    analysis,
    currentContextSummary: buildCapturedContextSummary(effectivePrompt, normalization, analysis, { visibility: latestCapture.visibility, latestCapture }, usage),
    history: state.captures,
    modelHistory: state.modelSelections,
  };
}

export async function collectContextInspectionReport(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext
): Promise<ContextInspectionReport> {
  const diagnostics: ReportDiagnostic[] = [];
  const cwd = ctx.cwd;
  const effectivePrompt = ctx.getSystemPrompt();
  const parsedPrompt = parseSystemPrompt(effectivePrompt);

  const allTools = pi.getAllTools();
  const toolSummary = buildToolDefinitionsSummary(allTools);
  const toolSection = buildToolDefinitionsSection(toolSummary);

  const discoveredPaths = discoverPromptPaths(cwd);
  const files = readDiscoveredPromptFiles(discoveredPaths, diagnostics);
  markSourceFileInclusion(
    files,
    effectivePrompt,
    parsedPrompt.sections.some((section) => section.kind === "system-append")
  );

  const usage = ctx.getContextUsage();
  if (!usage) {
    diagnostics.push({
      level: "info",
      message: "Context usage metadata was not available from ctx.getContextUsage().",
    });
  }

  if (!toolSection) {
    diagnostics.push({ level: "info", message: "No tools were registered for tool-definition analysis." });
  }

  if (effectivePrompt.includes("Available tools:\n(none)") && toolSummary.count > 0) {
    diagnostics.push({
      level: "warning",
      message:
        `The effective system prompt reports no prompt-visible tools, but ${String(toolSummary.count)} registered tool definitions were discovered separately. This likely means ctx.getSystemPrompt() reflects a prompt variant that omits tool snippets for this command context.`,
    });
  }

  const basePromptText = parsedPrompt.sections.find((section) => section.kind === "base")?.content ?? "";
  const trace = basePromptText
    ? await collectBaseTrace(cwd, discoveredPaths.agentDir, basePromptText, diagnostics)
    : undefined;

  const totalSkillTokens = parsedPrompt.skills.reduce((sum, skill) => sum + skill.tokens, 0);
  const payload = buildPayloadReport(ctx, effectivePrompt, diagnostics);
  const agentsCoverage = analyzeAgentsCoverage({
    diskFiles: files.agents,
    promptBlocks: parsedPrompt.agentsFiles,
    payloadSystemBlocks: payload.normalization?.system.map((section) => ({
      label: section.label,
      text: section.text,
    })) ?? [],
    payloadVisibility: payload.visibility,
    payloadNormalizationStatus: payload.normalization?.status,
  });

  for (const file of files.agents) {
    file.agentsCoverage = agentsCoverage.items.find((item) => item.path === file.path);
    if (file.agentsCoverage) {
      file.includedInPrompt = file.agentsCoverage.presentInVisiblePrompt;
    }
  }

  for (const coverageDiagnostic of agentsCoverage.diagnostics) {
    diagnostics.push({
      level: coverageDiagnostic.level,
      source: coverageDiagnostic.path,
      message: `AGENTS coverage: ${coverageDiagnostic.message}`,
    });
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      reportId: createReportId(),
      cwd,
      agentDir: discoveredPaths.agentDir,
      modelId: getModelId(ctx),
      contextWindow: usage?.contextWindow ?? (ctx as { model?: { contextWindow?: number } }).model?.contextWindow,
      usedContextTokens: usage?.tokens ?? undefined,
      remainingContextTokens:
        usage?.contextWindow && usage?.tokens != null ? usage.contextWindow - usage.tokens : undefined,
    },
    prompt: {
      effective: effectivePrompt,
      totalChars: parsedPrompt.totalChars,
      totalTokens: parsedPrompt.totalTokens,
      sections: parsedPrompt.sections,
    },
    files,
    agentsCoverage,
    tools: toolSummary,
    skills: {
      count: parsedPrompt.skills.length,
      totalTokens: totalSkillTokens,
      items: parsedPrompt.skills,
    },
    payload,
    trace,
    diagnostics,
  };
}
