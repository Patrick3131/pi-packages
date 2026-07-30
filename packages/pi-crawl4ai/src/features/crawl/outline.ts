/**
 * Outline / chunk helpers for progressive crawl reads.
 */

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
  const lines = markdown.split(/\r?\n/);
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      title: match[2].replace(/#+\s*$/, "").trim(),
      line: i + 1,
    });
  }
  return headings;
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
  const lines = markdown.split(/\r?\n/);
  const headings = extractHeadings(markdown);
  const chunks: ContentChunk[] = [];

  if (headings.length === 0) {
    const text = markdown.trim();
    if (text) {
      chunks.push({
        id: "chunk-0",
        startLine: 1,
        endLine: lines.length,
        text,
        score: 0,
      });
    }
    return chunks;
  }

  // Preamble before first heading
  if (headings[0].line > 1) {
    const preamble = lines.slice(0, headings[0].line - 1).join("\n").trim();
    if (preamble) {
      chunks.push({
        id: "chunk-0",
        heading: "(preamble)",
        level: 0,
        startLine: 1,
        endLine: headings[0].line - 1,
        text: preamble,
        score: 0,
      });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].line; // 1-based
    const end = i + 1 < headings.length ? headings[i + 1].line - 1 : lines.length;
    const text = lines.slice(start - 1, end).join("\n").trim();
    if (!text) continue;
    chunks.push({
      id: `chunk-${chunks.length}`,
      heading: headings[i].title,
      level: headings[i].level,
      startLine: start,
      endLine: end,
      text,
      score: 0,
    });
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 1);
}

/** Simple query relevance score for a chunk (keyword overlap + heading boost). */
export function scoreChunk(chunk: ContentChunk, query: string): number {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0) return 0;

  const headingTokens = new Set(tokenize(chunk.heading ?? ""));
  const bodyTokens = tokenize(chunk.text);
  const bodySet = new Set(bodyTokens);

  let score = 0;
  for (const token of qTokens) {
    if (headingTokens.has(token)) score += 3;
    if (bodySet.has(token)) score += 1;
    // light frequency signal
    const freq = bodyTokens.filter((t) => t === token).length;
    if (freq > 1) score += Math.min(freq - 1, 3) * 0.25;
  }
  return score;
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
  let chunks = splitIntoSections(markdown);

  if (query?.trim()) {
    chunks = chunks
      .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, query) }))
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score || a.startLine - b.startLine);
  }

  const selected: ContentChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    if (selected.length >= maxChunks) break;
    const cost = chunk.text.length + 80; // heading overhead
    if (selected.length > 0 && used + cost > maxChars) break;
    if (selected.length === 0 && cost > maxChars) {
      // always return something: truncated first chunk
      selected.push({
        ...chunk,
        text: `${chunk.text.slice(0, Math.max(0, maxChars - 20))}\n… [truncated]`,
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
  if (maxChars <= 0 || text.length <= maxChars) {
    return { text, truncated: false };
  }
  const marker = `\n\n… [truncated ${text.length} → ${maxChars} chars]`;
  const bodyBudget = Math.max(0, maxChars - marker.length);
  return { text: `${text.slice(0, bodyBudget)}${marker}`, truncated: true };
}
