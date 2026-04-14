import type {
  ExtensionToolContribution,
  TraceBucket,
  TraceLineEvidence,
} from "./types.js";

const BUILT_IN_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

const BUILT_IN_GUIDELINES = new Set([
  "Use bash for file operations like ls, rg, find",
  "Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
  "Be concise in your responses",
  "Show file paths clearly when working with files",
]);

export function normalizeSnippet(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function extractToolName(line: string): string {
  return line.match(/^- (\S+):/)?.[1] ?? "";
}

function extractGuidelineText(line: string): string {
  return line.startsWith("- ") ? line.slice(2).trim() : line.trim();
}

function attributeLine(
  line: string,
  kind: "tool-line" | "guideline-line",
  tokenize: (text: string) => number,
  lookupContributors: (line: string) => string[] | undefined,
  isBuiltIn: (line: string) => boolean
): TraceLineEvidence {
  const tokens = tokenize(line);
  if (isBuiltIn(line)) {
    return { line, tokens, kind, contributors: ["built-in"], bucket: "built-in" };
  }

  const contributors = lookupContributors(line);
  if (contributors && contributors.length === 1) {
    return { line, tokens, kind, contributors: [...contributors], bucket: "extension" };
  }
  if (contributors && contributors.length > 1) {
    return { line, tokens, kind, contributors: [...contributors], bucket: "shared" };
  }
  return { line, tokens, kind, contributors: [], bucket: "unattributed" };
}

function resolveBucketId(evidence: TraceLineEvidence): { id: string; label: string } {
  if (evidence.bucket === "built-in") {
    return { id: "built-in", label: "Built-in/core" };
  }
  if (evidence.bucket === "shared") {
    return { id: "shared", label: "Shared (multi-extension)" };
  }
  if (evidence.bucket === "unattributed") {
    return { id: "unattributed", label: "Unattributed" };
  }
  const [contributor] = evidence.contributors;
  return { id: contributor ?? "extension", label: contributor ?? "Extension" };
}

export function attributeBasePrompt(
  toolLines: string[],
  guidelineLines: string[],
  contributions: ExtensionToolContribution[],
  baseTokens: number,
  tokenize: (text: string) => number
): { buckets: TraceBucket[]; evidence: TraceLineEvidence[] } {
  const toolSnippetMap = new Map<string, string[]>();
  for (const contribution of contributions) {
    if (!contribution.snippet) {
      continue;
    }
    const key = `${contribution.toolName}:${normalizeSnippet(contribution.snippet)}`;
    const existing = toolSnippetMap.get(key) ?? [];
    existing.push(contribution.extensionPath);
    toolSnippetMap.set(key, existing);
  }

  const guidelineMap = new Map<string, string[]>();
  for (const contribution of contributions) {
    for (const guideline of contribution.guidelines) {
      const normalized = guideline.trim();
      if (!normalized) {
        continue;
      }
      const existing = guidelineMap.get(normalized) ?? [];
      existing.push(contribution.extensionPath);
      guidelineMap.set(normalized, existing);
    }
  }

  const evidence: TraceLineEvidence[] = [];

  for (const line of toolLines) {
    evidence.push(
      attributeLine(
        line,
        "tool-line",
        tokenize,
        (value) => {
          const toolName = extractToolName(value);
          const snippetPart = value.replace(/^- \S+:\s*/, "");
          return toolSnippetMap.get(`${toolName}:${normalizeSnippet(snippetPart)}`);
        },
        (value) => BUILT_IN_TOOLS.has(extractToolName(value))
      )
    );
  }

  for (const line of guidelineLines) {
    evidence.push(
      attributeLine(
        line,
        "guideline-line",
        tokenize,
        (value) => guidelineMap.get(extractGuidelineText(value)),
        (value) => BUILT_IN_GUIDELINES.has(extractGuidelineText(value))
      )
    );
  }

  const bucketMap = new Map<string, { label: string; tokens: number; lineCount: number }>();
  for (const line of evidence) {
    const { id, label } = resolveBucketId(line);
    const existing = bucketMap.get(id) ?? { label, tokens: 0, lineCount: 0 };
    existing.tokens += line.tokens;
    existing.lineCount += 1;
    bucketMap.set(id, existing);
  }

  const buckets: TraceBucket[] = [...bucketMap.entries()]
    .map(([id, data]) => ({
      id,
      label: data.label,
      tokens: data.tokens,
      lineCount: data.lineCount,
      pctOfBase: baseTokens > 0 ? (data.tokens / baseTokens) * 100 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return { buckets, evidence };
}
