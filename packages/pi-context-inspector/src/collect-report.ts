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
import { readDiscoveredPromptFiles } from "./file-reading.js";
import { buildToolDefinitionsSection, buildToolDefinitionsSummary, estimateTokens, parseSystemPrompt } from "./parser.js";
import { discoverPromptPaths } from "./path-discovery.js";
import type { ContextInspectionReport, ReportDiagnostic, SourceFileRecord } from "./types.js";

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
    tools: toolSummary,
    skills: {
      count: parsedPrompt.skills.length,
      totalTokens: totalSkillTokens,
      items: parsedPrompt.skills,
    },
    trace,
    diagnostics,
  };
}
