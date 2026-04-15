import { encode } from "gpt-tokenizer/encoding/o200k_base";

import type {
  ParsedPrompt,
  PromptAgentsFileBlock,
  ReportChildSection,
  ReportSection,
  SkillReport,
  ToolDefinitionReport,
  ToolDefinitionsSummary,
} from "./types.js";

export function estimateTokens(text: string): number {
  return encode(text).length;
}

function measureSection(
  id: string,
  kind: ReportSection["kind"],
  label: string,
  content: string,
  children?: ReportChildSection[]
): ReportSection {
  return {
    id,
    kind,
    label,
    content,
    chars: content.length,
    tokens: estimateTokens(content),
    children,
  };
}

function firstPositive(...values: number[]): number {
  let min = -1;
  for (const value of values) {
    if (value >= 0 && (min < 0 || value < min)) {
      min = value;
    }
  }
  return min;
}

function findMetadataStart(prompt: string): number {
  const currentDateIdx = prompt.lastIndexOf("\nCurrent date:");
  const oldDateIdx = prompt.lastIndexOf("\nCurrent date and time:");
  const cwdIdx = prompt.lastIndexOf("\nCurrent working directory:");

  const dateStart = firstPositive(currentDateIdx, oldDateIdx);
  if (dateStart !== -1) {
    return dateStart;
  }
  return cwdIdx;
}

function findBasePromptEnd(
  prompt: string,
  projectContextIdx: number,
  skillsPreambleIdx: number,
  metadataIdx: number
): number {
  const piDocsMarker = /^- (?:Always read pi|When working on pi).+$/gm;
  let lastPiDocsEnd = -1;
  for (const match of prompt.matchAll(piDocsMarker)) {
    lastPiDocsEnd = (match.index ?? 0) + match[0].length;
  }

  if (lastPiDocsEnd !== -1) {
    return lastPiDocsEnd;
  }

  return firstPositive(projectContextIdx, skillsPreambleIdx, metadataIdx);
}

function isLikelyPromptContextPathHeading(heading: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]).+\.md$/.test(heading);
}

function parseAgentFileSubsections(
  filePath: string,
  fileBlock: string,
  startIndex: number
): ReportChildSection[] {
  const children: ReportChildSection[] = [
    {
      id: `agent-${startIndex}`,
      label: filePath,
      content: fileBlock,
      chars: fileBlock.length,
      tokens: estimateTokens(fileBlock),
      sourcePath: filePath,
    },
  ];

  const contentAfterPathHeading = fileBlock.replace(/^## .+\n*/, "").trim();
  const subsectionPattern = /^## (.+)$/gm;
  const subsectionMatches = [...contentAfterPathHeading.matchAll(subsectionPattern)].filter(
    (match) => !isLikelyPromptContextPathHeading(match[1]?.trim() ?? "")
  );

  for (let subsectionIndex = 0; subsectionIndex < subsectionMatches.length; subsectionIndex += 1) {
    const match = subsectionMatches[subsectionIndex];
    const label = match[1]?.trim() ?? "unknown";
    const blockStart = match.index ?? 0;
    const blockEnd =
      subsectionIndex + 1 < subsectionMatches.length
        ? ((subsectionMatches[subsectionIndex + 1]?.index as number | undefined) ?? contentAfterPathHeading.length)
        : contentAfterPathHeading.length;
    const content = contentAfterPathHeading.slice(blockStart, blockEnd).trim();
    children.push({
      id: `agent-${startIndex + subsectionIndex + 1}`,
      label,
      content,
      chars: content.length,
      tokens: estimateTokens(content),
      sourcePath: filePath,
    });
  }

  return children;
}

export function parseAgentsFileBlocks(contextBlock: string): PromptAgentsFileBlock[] {
  const files: PromptAgentsFileBlock[] = [];
  const headingPattern = /^## (.+)$/gm;
  const matches = [...contextBlock.matchAll(headingPattern)].filter((match) =>
    isLikelyPromptContextPathHeading(match[1]?.trim() ?? "")
  );

  let childIndex = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = match[1]?.trim() ?? "unknown";
    const blockStart = match.index ?? 0;
    const blockEnd =
      index + 1 < matches.length
        ? ((matches[index + 1]?.index as number | undefined) ?? contextBlock.length)
        : contextBlock.length;
    const rawBlock = contextBlock.slice(blockStart, blockEnd).trim();
    const bodyText = rawBlock.replace(/^## .+\n*/, "").trim();
    const children = parseAgentFileSubsections(heading, rawBlock, childIndex);
    files.push({
      path: heading,
      rawBlock,
      bodyText,
      chars: bodyText.length,
      tokens: estimateTokens(bodyText),
      children,
    });
    childIndex += children.length;
  }

  return files;
}

function parseSkillEntries(xmlBlock: string): SkillReport[] {
  const items: SkillReport[] = [];
  const skillPattern = /<skill>([\s\S]*?)<\/skill>/g;
  const namePattern = /<name>([\s\S]*?)<\/name>/;
  const descPattern = /<description>([\s\S]*?)<\/description>/;
  const locPattern = /<location>([\s\S]*?)<\/location>/;

  for (const match of xmlBlock.matchAll(skillPattern)) {
    const fullEntry = match[0];
    const inner = match[1] ?? "";
    items.push({
      name: inner.match(namePattern)?.[1]?.trim() ?? "unknown",
      description: inner.match(descPattern)?.[1]?.trim() ?? "",
      location: inner.match(locPattern)?.[1]?.trim() ?? "",
      chars: fullEntry.length,
      tokens: estimateTokens(fullEntry),
    });
  }

  return items;
}

function withPercentages(parsed: ParsedPrompt): ParsedPrompt {
  const total = parsed.totalTokens || 1;
  return {
    ...parsed,
    sections: parsed.sections.map((section) => ({
      ...section,
      percentageOfPrompt: (section.tokens / total) * 100,
    })),
  };
}

export function parseSystemPrompt(prompt: string): ParsedPrompt {
  const sections: ReportSection[] = [];
  let agentsFiles: PromptAgentsFileBlock[] = [];
  const projectContextIdx = prompt.indexOf("\n\n# Project Context\n");
  const skillsPreambleIdx = prompt.indexOf(
    "\n\nThe following skills provide specialized instructions"
  );
  const availableSkillsStart = prompt.indexOf("<available_skills>");
  const availableSkillsEnd = prompt.indexOf("</available_skills>");
  const metadataIdx = findMetadataStart(prompt);

  const baseEnd = findBasePromptEnd(
    prompt,
    projectContextIdx,
    skillsPreambleIdx,
    metadataIdx
  );
  const baseText = baseEnd >= 0 ? prompt.slice(0, baseEnd).trimEnd() : prompt;
  sections.push(measureSection("base-prompt", "base", "Base prompt", baseText));

  const nextSectionStart = firstPositive(projectContextIdx, skillsPreambleIdx, metadataIdx);
  if (baseEnd >= 0 && nextSectionStart > baseEnd) {
    const gap = prompt.slice(baseEnd, nextSectionStart).trim();
    if (gap.length > 0) {
      sections.push(
        measureSection(
          "system-append",
          "system-append",
          "SYSTEM.md / APPEND_SYSTEM.md",
          gap
        )
      );
    }
  }

  if (projectContextIdx !== -1) {
    const contextStart = projectContextIdx + 2;
    const contextEnd = firstPositive(skillsPreambleIdx, metadataIdx);
    const contextBlock =
      contextEnd >= 0
        ? prompt.slice(contextStart, contextEnd).trim()
        : prompt.slice(contextStart).trim();
    agentsFiles = parseAgentsFileBlocks(contextBlock);
    sections.push(
      measureSection(
        "agents-files",
        "agents",
        "AGENTS.md files",
        contextBlock,
        agentsFiles.flatMap((file) => file.children ?? [])
      )
    );
  }

  let skills: SkillReport[] = [];
  if (skillsPreambleIdx !== -1) {
    const skillsStart = skillsPreambleIdx + 2;
    const skillsEnd =
      availableSkillsEnd !== -1
        ? availableSkillsEnd + "</available_skills>".length
        : metadataIdx !== -1
          ? metadataIdx
          : prompt.length;
    const skillsText = prompt.slice(skillsStart, skillsEnd).trim();
    if (availableSkillsStart !== -1 && availableSkillsEnd !== -1) {
      const xmlBlock = prompt.slice(
        availableSkillsStart,
        availableSkillsEnd + "</available_skills>".length
      );
      skills = parseSkillEntries(xmlBlock);
    }
    sections.push(
      measureSection(
        "skills",
        "skills",
        `Skills (${String(skills.length)})`,
        skillsText,
        skills.map((skill, index) => ({
          id: `skill-${index}`,
          label: skill.name,
          chars: skill.chars,
          tokens: skill.tokens,
          content: [
            `<name>${skill.name}</name>`,
            `<description>${skill.description}</description>`,
            `<location>${skill.location}</location>`,
          ].join("\n"),
          sourcePath: skill.location || undefined,
        }))
      )
    );
  }

  if (metadataIdx !== -1) {
    const metadataText = prompt.slice(metadataIdx + 1).trim();
    sections.push(
      measureSection(
        "metadata",
        "metadata",
        "Metadata (date, cwd)",
        metadataText
      )
    );
  }

  return withPercentages({
    sections,
    totalChars: prompt.length,
    totalTokens: estimateTokens(prompt),
    skills,
    agentsFiles,
  });
}

interface ToolInput {
  name: string;
  description?: string;
  parameters?: unknown;
}

export function buildToolDefinitionsSummary(tools: ToolInput[]): ToolDefinitionsSummary {
  const items: ToolDefinitionReport[] = tools.map((tool) => {
    const serialized = JSON.stringify(
      {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.parameters ?? null,
      },
      null,
      2
    );

    return {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.parameters ?? null,
      serialized,
      chars: serialized.length,
      tokens: estimateTokens(serialized),
    };
  });

  return {
    count: items.length,
    totalChars: items.reduce((sum, item) => sum + item.chars, 0),
    totalTokens: items.reduce((sum, item) => sum + item.tokens, 0),
    items,
  };
}

export function buildToolDefinitionsSection(
  summary: ToolDefinitionsSummary
): ReportSection | undefined {
  if (summary.count === 0) {
    return undefined;
  }

  return {
    id: "tool-definitions",
    kind: "tools",
    label: `Tool definitions (${String(summary.count)})`,
    chars: summary.totalChars,
    tokens: summary.totalTokens,
    percentageOfPrompt: undefined,
    children: summary.items.map((item, index) => ({
      id: `tool-${index}`,
      label: item.name,
      chars: item.chars,
      tokens: item.tokens,
      content: item.serialized,
    })),
  };
}
