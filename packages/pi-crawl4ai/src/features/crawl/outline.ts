/**
 * Outline / chunk helpers for progressive crawl reads.
 */

import { markdownHeadings, rankSections, splitMarkdownSections } from "./bm25";

export interface Heading {
  level: number;
  title: string;
  /** 1-based line number in the source markdown */
  line: number;
}

export interface ContentChunk {
  id: string;
  heading?: string;
  level?: number;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

export interface PageMeta {
  url?: string;
  title?: string;
  charCount: number;
  lineCount: number;
  headings: Heading[];
  savedAt: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/** Extract markdown ATX headings with line numbers. */
export function extractHeadings(markdown: string): Heading[] {
  return markdownHeadings(markdown);
}

/** First non-empty, non-heading line after a heading (for outline previews). */
export function firstContentLineAfter(
  lines: string[],
  headingLineIndex0: number
): string | undefined {
  for (let i = headingLineIndex0 + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (HEADING_RE.test(lines[i])) break;
    return line.replace(/^>\s*/, "").slice(0, 160);
  }
  return undefined;
}

/** Build a compact outline markdown for a saved page. */
export function buildOutlineMarkdown(options: {
  url?: string;
  title?: string;
  content: string;
  maxPreviewChars?: number;
}): string {
  const { url, title, content, maxPreviewChars = 120 } = options;
  const lines = content.split(/\r?\n/);
  const headings = extractHeadings(content);
  const header = [
    title ? `# Outline: ${title}` : "# Outline",
    url ? `Source: ${url}` : undefined,
    `Chars: ${content.length} · Headings: ${headings.length}`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  if (headings.length === 0) {
    const preview = content.replace(/\s+/g, " ").trim().slice(0, maxPreviewChars);
    return `${header}\n(No headings found)\n\nPreview: ${preview}${content.length > maxPreviewChars ? "…" : ""}\n`;
  }

  const body = headings
    .map((heading) => {
      const indent = "  ".repeat(Math.max(0, heading.level - 1));
      const preview = firstContentLineAfter(lines, heading.line - 1);
      const short =
        preview && preview.length > maxPreviewChars
          ? `${preview.slice(0, maxPreviewChars)}…`
          : preview;
      return short
        ? `${indent}- L${heading.line} ${"#".repeat(heading.level)} ${heading.title} — ${short}`
        : `${indent}- L${heading.line} ${"#".repeat(heading.level)} ${heading.title}`;
    })
    .join("\n");

  return `${header}\n${body}\n`;
}

export function buildPageMeta(options: {
  url?: string;
  title?: string;
  content: string;
  savedAt?: string;
}): PageMeta {
  const headings = extractHeadings(options.content);
  const inferredTitle =
    options.title ||
    headings.find((h) => h.level === 1)?.title ||
    headings[0]?.title;
  return {
    url: options.url,
    title: inferredTitle,
    charCount: options.content.length,
    lineCount: options.content.split(/\r?\n/).length,
    headings,
    savedAt: options.savedAt ?? new Date().toISOString(),
  };
}

/**
 * Split markdown into heading-bounded sections.
 * Content before the first heading becomes a preamble chunk.
 */
export function splitIntoSections(markdown: string): ContentChunk[] {
  return splitMarkdownSections(markdown);
}

/** Compatibility helper for a single chunk; page ranking uses the complete corpus. */
export function scoreChunk(chunk: ContentChunk, query: string): number {
  return rankSections([chunk], query)[0].score;
}

/**
 * Select chunks for context. With query: ranked matches. Without: first sections under budget.
 */
export function selectChunks(options: {
  markdown: string;
  query?: string;
  maxChars: number;
  maxChunks?: number;
}): ContentChunk[] {
  const { markdown, query, maxChars, maxChunks = 8 } = options;
  if (!Number.isFinite(maxChars) || maxChars <= 0 || maxChunks <= 0) return [];
  let chunks = splitIntoSections(markdown);

  if (query?.trim()) {
    chunks = rankSections(chunks, query).filter((chunk) => chunk.score > 0);
  }

  const selected: ContentChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    if (selected.length >= maxChunks) break;
    const cost = chunk.text.length + 80; // heading overhead
    if (selected.length > 0 && used + cost > maxChars) break;
    if (selected.length === 0 && cost > maxChars) {
      const marker = `\n… [excerpt L${chunk.startLine}–${chunk.endLine}]`;
      const available = Math.floor(maxChars) - 80;
      if (available <= marker.length) break;
      selected.push({
        ...chunk,
        text: `${chunk.text.slice(0, available - marker.length)}${marker}`,
      });
      break;
    }
    selected.push(chunk);
    used += cost;
  }

  // Keep reading order when query ranked
  if (query?.trim()) {
    selected.sort((a, b) => a.startLine - b.startLine);
  }
  return selected;
}

/** Line window (1-based offset, limit lines). */
export function windowLines(
  content: string,
  offset = 1,
  limit = 80
): { text: string; startLine: number; endLine: number; totalLines: number } {
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  const start = Math.max(1, offset);
  const end = Math.min(totalLines, start + Math.max(1, limit) - 1);
  const text = lines.slice(start - 1, end).join("\n");
  return { text, startLine: start, endLine: end, totalLines };
}

export function truncateToBudget(text: string, maxChars: number): { text: string; truncated: boolean } {
  const cap = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  if (text.length <= cap) return { text, truncated: false };
  const marker = `\n\n… [truncated ${text.length} → ${cap} chars]`;
  if (cap < marker.length) return { text: marker.slice(0, cap), truncated: true };
  return { text: `${text.slice(0, cap - marker.length)}${marker}`, truncated: true };
}
