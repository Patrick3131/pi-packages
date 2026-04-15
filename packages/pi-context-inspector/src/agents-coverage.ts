import { estimateTokens } from "./parser.js";
import type {
  AgentsCoverageAnalysis,
  AgentsCoverageComparison,
  AgentsCoverageDiagnostic,
  AgentsCoverageEvidence,
  AgentsCoverageStatus,
  NormalizationStatus,
  PayloadVisibility,
  PromptAgentsFileBlock,
  SourceFileRecord,
} from "./types.js";

interface AnalyzeAgentsCoverageInput {
  diskFiles: SourceFileRecord[];
  promptBlocks: PromptAgentsFileBlock[];
  payloadSystemBlocks: Array<{ label: string; text: string }>;
  payloadVisibility?: PayloadVisibility;
  payloadNormalizationStatus?: NormalizationStatus;
}

interface ComparedCandidate {
  text: string;
  normalizedText: string;
  exactMatch: boolean;
  normalizedMatch: boolean;
  matchedChars: number;
  matchedTokens: number;
  coveragePercent: number;
  contiguousCoveragePercent: number;
  missingExcerpt?: string;
  extraExcerpt?: string;
}

const PARTIAL_COVERAGE_THRESHOLD = 20;
const PARTIAL_CONTIGUOUS_THRESHOLD = 12;
const HIGH_COVERAGE_THRESHOLD = 95;
const TRANSFORMED_COVERAGE_THRESHOLD = 70;

function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function toLines(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function excerpt(lines: string[]): string | undefined {
  if (lines.length === 0) {
    return undefined;
  }
  return lines.slice(0, 8).join("\n");
}

function longestCommonSubstringLength(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }

  const previous = new Array<number>(b.length + 1).fill(0);
  let best = 0;

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) {
          best = current[j];
        }
      }
    }
    for (let j = 0; j < current.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return best;
}

function compareTexts(diskText: string, candidateText: string): ComparedCandidate {
  const normalizedDisk = normalizeText(diskText);
  const normalizedCandidate = normalizeText(candidateText);
  const diskLines = toLines(diskText);
  const candidateLineSet = new Set(toLines(candidateText));
  const matchedLines = diskLines.filter((line) => candidateLineSet.has(line));
  const missingLines = diskLines.filter((line) => !candidateLineSet.has(line));
  const extraLines = toLines(candidateText).filter((line) => !new Set(diskLines).has(line));

  const matchedChars = matchedLines.reduce((sum, line) => sum + line.length, 0);
  const diskComparableChars = diskLines.reduce((sum, line) => sum + line.length, 0) || normalizedDisk.length || 1;
  const coveragePercent = Math.max(
    normalizedDisk.length > 0 && normalizedCandidate.includes(normalizedDisk) ? 100 : 0,
    Math.min(100, (matchedChars / diskComparableChars) * 100)
  );
  const contiguousLength = longestCommonSubstringLength(normalizedDisk, normalizedCandidate);
  const contiguousCoveragePercent = normalizedDisk.length === 0 ? 0 : (contiguousLength / normalizedDisk.length) * 100;

  return {
    text: candidateText,
    normalizedText: normalizedCandidate,
    exactMatch: candidateText.trim() === diskText.trim(),
    normalizedMatch: normalizedCandidate === normalizedDisk,
    matchedChars: Math.max(matchedChars, contiguousLength),
    matchedTokens: estimateTokens(normalizedDisk.slice(0, Math.max(matchedChars, contiguousLength))),
    coveragePercent,
    contiguousCoveragePercent,
    missingExcerpt: excerpt(missingLines),
    extraExcerpt: excerpt(extraLines),
  };
}

function comparePromptBlocks(
  diskFile: SourceFileRecord,
  promptBlock: PromptAgentsFileBlock | undefined
): AgentsCoverageComparison | undefined {
  if (!promptBlock) {
    return undefined;
  }

  if (!diskFile.content) {
    return {
      found: true,
      sourceType: "prompt",
      sourceLabel: promptBlock.path,
      rawText: promptBlock.bodyText,
      normalizedText: normalizeText(promptBlock.bodyText),
    };
  }

  const compared = compareTexts(diskFile.content, promptBlock.bodyText);
  return {
    found: true,
    sourceType: "prompt",
    sourceLabel: promptBlock.path,
    rawText: promptBlock.bodyText,
    normalizedText: compared.normalizedText,
    exactMatch: compared.exactMatch,
    normalizedMatch: compared.normalizedMatch,
    matchedChars: compared.matchedChars,
    matchedTokens: compared.matchedTokens,
    totalChars: normalizeText(diskFile.content).length,
    totalTokens: estimateTokens(normalizeText(diskFile.content)),
    coveragePercent: compared.coveragePercent,
    contiguousCoveragePercent: compared.contiguousCoveragePercent,
    missingExcerpt: compared.missingExcerpt,
    extraExcerpt: compared.extraExcerpt,
  };
}

function buildPayloadCandidates(
  diskFiles: SourceFileRecord[],
  payloadSystemBlocks: Array<{ label: string; text: string }>
): Map<string, AgentsCoverageComparison | undefined> {
  const results = new Map<string, AgentsCoverageComparison | undefined>();

  for (const diskFile of diskFiles) {
    if (!diskFile.readable || !diskFile.content) {
      results.set(diskFile.path, undefined);
      continue;
    }

    const comparisons = payloadSystemBlocks.map((block) => ({
      label: block.label,
      compared: compareTexts(diskFile.content!, block.text),
    }));
    const best = comparisons.sort((a, b) => {
      if (b.compared.coveragePercent !== a.compared.coveragePercent) {
        return b.compared.coveragePercent - a.compared.coveragePercent;
      }
      return b.compared.contiguousCoveragePercent - a.compared.contiguousCoveragePercent;
    })[0];

    if (!best || (best.compared.coveragePercent < PARTIAL_COVERAGE_THRESHOLD && best.compared.contiguousCoveragePercent < PARTIAL_CONTIGUOUS_THRESHOLD)) {
      results.set(diskFile.path, undefined);
      continue;
    }

    const normalizedDisk = normalizeText(diskFile.content);
    const competingPaths = diskFiles
      .filter((candidate) => candidate.path !== diskFile.path && candidate.readable && candidate.content)
      .filter((candidate) => {
        const other = compareTexts(candidate.content!, best.compared.text);
        return Math.abs(other.coveragePercent - best.compared.coveragePercent) < 0.01
          && Math.abs(other.contiguousCoveragePercent - best.compared.contiguousCoveragePercent) < 0.01
          && normalizeText(candidate.content!) === normalizedDisk;
      })
      .map((candidate) => candidate.path);

    results.set(diskFile.path, {
      found: true,
      sourceType: "payload",
      sourceLabel: best.label,
      rawText: best.compared.text,
      normalizedText: best.compared.normalizedText,
      exactMatch: best.compared.exactMatch,
      normalizedMatch: best.compared.normalizedMatch,
      matchedChars: best.compared.matchedChars,
      matchedTokens: best.compared.matchedTokens,
      totalChars: normalizedDisk.length,
      totalTokens: estimateTokens(normalizedDisk),
      coveragePercent: best.compared.coveragePercent,
      contiguousCoveragePercent: best.compared.contiguousCoveragePercent,
      missingExcerpt: best.compared.missingExcerpt,
      extraExcerpt: best.compared.extraExcerpt,
      ambiguousWithPaths: competingPaths.length > 0 ? [diskFile.path, ...competingPaths].sort() : undefined,
    });
  }

  return results;
}

function summarizeSource(prompt?: AgentsCoverageComparison, payload?: AgentsCoverageComparison): AgentsCoverageEvidence {
  return {
    prompt: !!prompt,
    payload: !!payload,
    source: prompt && payload ? "mixed" : prompt ? "prompt" : payload ? "payload" : "none",
  };
}

function getStatus(
  readable: boolean,
  prompt?: AgentsCoverageComparison,
  payload?: AgentsCoverageComparison,
  payloadVisibility?: PayloadVisibility,
  payloadNormalizationStatus?: NormalizationStatus
): { status: AgentsCoverageStatus; reason: string; notes: string[]; caveats: string[] } {
  const notes: string[] = [];
  const caveats: string[] = [];

  if (!readable) {
    if (prompt) {
      notes.push("A headed AGENTS block for this path was visible in ctx.getSystemPrompt(), but the on-disk file could not be compared.");
    }
    return {
      status: "unable-to-determine",
      reason: prompt
        ? "A visible AGENTS block for this file is present in ctx.getSystemPrompt(), but the on-disk file could not be read for comparison."
        : "The AGENTS file exists on disk but could not be read for comparison.",
      notes,
      caveats,
    };
  }

  const promptCoverage = prompt?.coveragePercent ?? 0;
  const promptContiguousCoverage = prompt?.contiguousCoveragePercent ?? 0;
  const payloadCoverage = payload?.coveragePercent ?? 0;
  const payloadContiguousCoverage = payload?.contiguousCoveragePercent ?? 0;

  if (prompt?.normalizedMatch) {
    if (!prompt.exactMatch) {
      notes.push("Prompt block matches after normalization; insignificant whitespace or line-ending differences were ignored.");
    }
    return {
      status: "full",
      reason: "A visible AGENTS block for this file is present in ctx.getSystemPrompt() and matches the on-disk file.",
      notes,
      caveats,
    };
  }

  if (prompt && promptCoverage >= HIGH_COVERAGE_THRESHOLD) {
    return {
      status: "transformed",
      reason: "A visible AGENTS block for this file appears in ctx.getSystemPrompt(), but the content is reformatted or altered enough that it is not an exact normalized match.",
      notes,
      caveats,
    };
  }

  if (prompt && (promptCoverage >= PARTIAL_COVERAGE_THRESHOLD || promptContiguousCoverage >= PARTIAL_CONTIGUOUS_THRESHOLD)) {
    return {
      status: "partial",
      reason: "A visible AGENTS block for this file is present in ctx.getSystemPrompt(), but only part of the on-disk content is visible.",
      notes,
      caveats,
    };
  }

  if (payload?.ambiguousWithPaths?.length) {
    caveats.push(`Payload match is ambiguous across similar AGENTS files: ${payload.ambiguousWithPaths.join(", ")}.`);
    return {
      status: "unable-to-determine",
      reason: "Captured payload text resembles this AGENTS file, but the match is ambiguous across multiple files.",
      notes,
      caveats,
    };
  }

  if (payload?.normalizedMatch) {
    notes.push("The content was recognized in captured payload instructions, but no file-specific AGENTS heading was visible in ctx.getSystemPrompt().");
    if (payloadVisibility !== "exact-payload" || payloadNormalizationStatus !== "full") {
      caveats.push("Payload visibility or normalization is partial, so payload-only evidence is best-effort.");
    }
    return {
      status: "transformed",
      reason: "The on-disk AGENTS content was seen in captured payload instructions, but not as a clearly headed AGENTS block in the visible prompt.",
      notes,
      caveats,
    };
  }

  if (payload && payloadCoverage >= TRANSFORMED_COVERAGE_THRESHOLD) {
    caveats.push("Only payload evidence was available for this match; prompt-visible inclusion could not be confirmed.");
    if (payloadVisibility !== "exact-payload" || payloadNormalizationStatus !== "full") {
      caveats.push("Payload visibility or normalization is partial, so this estimate is conservative.");
    }
    return {
      status: "transformed",
      reason: "Captured payload instructions contain a strong but non-exact match for this AGENTS file, while the visible prompt does not expose a headed AGENTS block for it.",
      notes,
      caveats,
    };
  }

  if (payload && (payloadCoverage >= PARTIAL_COVERAGE_THRESHOLD || payloadContiguousCoverage >= PARTIAL_CONTIGUOUS_THRESHOLD)) {
    caveats.push("Only payload evidence was available for this partial match; prompt-visible inclusion could not be confirmed.");
    if (payloadVisibility !== "exact-payload" || payloadNormalizationStatus !== "full") {
      caveats.push("Payload visibility or normalization is partial, so this estimate is conservative.");
    }
    return {
      status: "partial",
      reason: "Captured payload instructions contain only part of this AGENTS file, and the visible prompt does not show a headed AGENTS block for it.",
      notes,
      caveats,
    };
  }

  if (payloadVisibility !== "exact-payload" || payloadNormalizationStatus !== "full") {
    caveats.push("Latest payload visibility or normalization was limited, so absence cannot be proven from payload alone.");
    return {
      status: "unable-to-determine",
      reason: "This AGENTS file was discovered on disk but was not observed in the visible prompt, and the payload evidence was too limited to rule it in or out confidently.",
      notes,
      caveats,
    };
  }

  return {
    status: "not-present",
    reason: "This AGENTS file was discovered on disk but was not observed in ctx.getSystemPrompt() or in the captured payload instructions analyzed here.",
    notes,
    caveats,
  };
}

function buildDiagnostics(items: AgentsCoverageAnalysis["items"]): AgentsCoverageDiagnostic[] {
  const diagnostics: AgentsCoverageDiagnostic[] = [];

  for (const item of items) {
    if (item.status === "not-present") {
      diagnostics.push({
        level: "warning",
        path: item.path,
        message: "Discovered on disk but not observed in current prompt/context evidence.",
      });
    }
    if (item.status === "partial") {
      diagnostics.push({
        level: "warning",
        path: item.path,
        message: `Only partial AGENTS coverage was observed (${item.coveragePercent?.toFixed(1) ?? "0.0"}%).`,
      });
    }
    if (item.status === "unable-to-determine") {
      diagnostics.push({
        level: "info",
        path: item.path,
        message: item.reason,
      });
    }
  }

  return diagnostics;
}

export function analyzeAgentsCoverage(input: AnalyzeAgentsCoverageInput): AgentsCoverageAnalysis {
  const promptBlockByPath = new Map(input.promptBlocks.map((block) => [block.path, block]));
  const payloadComparisons = buildPayloadCandidates(input.diskFiles, input.payloadSystemBlocks);

  const items = input.diskFiles.map((diskFile) => {
    const prompt = comparePromptBlocks(diskFile, promptBlockByPath.get(diskFile.path));
    const payload = payloadComparisons.get(diskFile.path);
    const source = summarizeSource(prompt, payload);
    const { status, reason, notes, caveats } = getStatus(
      diskFile.readable,
      prompt,
      payload,
      input.payloadVisibility,
      input.payloadNormalizationStatus
    );
    const coveragePercent = prompt?.coveragePercent ?? payload?.coveragePercent ?? 0;

    return {
      path: diskFile.path,
      discovered: diskFile.exists,
      readable: diskFile.readable,
      promptEvidence: prompt,
      payloadEvidence: payload,
      evidence: source,
      presentInVisiblePrompt: !!prompt,
      seenInCapturedPayload: !!payload,
      coveragePercent,
      matchedChars: prompt?.matchedChars ?? payload?.matchedChars,
      matchedTokens: prompt?.matchedTokens ?? payload?.matchedTokens,
      status,
      reason,
      notes,
      caveats,
      promptBlockText: prompt?.rawText,
      payloadEvidenceText: payload?.rawText,
      normalizedDiskText: diskFile.content ? normalizeText(diskFile.content) : undefined,
      missingFromPromptExcerpt: prompt?.missingExcerpt ?? payload?.missingExcerpt,
      extraInPromptExcerpt: prompt?.extraExcerpt ?? payload?.extraExcerpt,
    };
  });

  const summary = {
    totalDiscovered: items.length,
    readable: items.filter((item) => item.readable).length,
    full: items.filter((item) => item.status === "full").length,
    partial: items.filter((item) => item.status === "partial").length,
    transformed: items.filter((item) => item.status === "transformed").length,
    notPresent: items.filter((item) => item.status === "not-present").length,
    unableToDetermine: items.filter((item) => item.status === "unable-to-determine").length,
    presentInVisiblePrompt: items.filter((item) => item.presentInVisiblePrompt).length,
    seenInCapturedPayload: items.filter((item) => item.seenInCapturedPayload).length,
  };

  return {
    summary,
    items,
    diagnostics: buildDiagnostics(items),
  };
}
