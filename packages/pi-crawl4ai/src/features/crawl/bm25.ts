/** Small structural Markdown splitter and shared Okapi BM25 scorer; not a Markdown parser. */
export interface MarkdownHeading {
  level: number;
  title: string;
  line: number;
}

export interface MarkdownSection {
  id: string;
  heading?: string;
  level?: number;
  /** Inclusive, 1-based source lines (before any filtering or excerpts). */
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

const HEADING_RE = /^ {0,3}(#{1,6})[\t ]+(.+?)\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const INDENTED_CODE_RE = /^(?: {4}| {0,3}\t)/;

function sourceLines(markdown: string): string[] {
  return markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Record only ATX headings outside matching backtick/tilde fences. */
export function markdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fence: { char: string; length: number } | undefined;
  sourceLines(markdown).forEach((raw, index) => {
    const line = raw.replace(/\r?\n$/, "");
    const match = line.match(FENCE_RE);
    if (fence) {
      if (match && match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) {
        fence = undefined;
      }
      return;
    }
    if (match && !(match[1][0] === "`" && match[2].includes("`"))) {
      fence = { char: match[1][0], length: match[1].length };
      return;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      headings.push({ level: heading[1].length, title: heading[2].replace(/[\t ]+#+[\t ]*$/, "").trim(), line: index + 1 });
    }
  });
  return headings;
}

/** Heading sections, or blank-line paragraphs when headingless; fenced/indented code stays intact. */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = sourceLines(markdown);
  const headings = markdownHeadings(markdown);
  const sections: MarkdownSection[] = [];
  const append = (start: number, end: number, heading?: MarkdownHeading) => {
    const text = lines.slice(start - 1, end).join("");
    if (!text.trim()) return;
    sections.push({
      id: `chunk-${sections.length}`,
      ...(heading ? { heading: heading.title, level: heading.level } : {}),
      startLine: start, endLine: end, text, score: 0,
    });
  };
  if (headings.length) {
    if (headings[0].line > 1) append(1, headings[0].line - 1, { title: "(preamble)", level: 0, line: 1 });
    headings.forEach((heading, index) => append(heading.line, (headings[index + 1]?.line ?? lines.length + 1) - 1, heading));
    return sections;
  }

  let start = 1;
  let fence: { char: string; length: number } | undefined;
  let indentedCode = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r?\n$/, "");
    const match = line.match(FENCE_RE);
    if (fence) {
      if (match && match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) fence = undefined;
    } else if (match && !(match[1][0] === "`" && match[2].includes("`"))) {
      fence = { char: match[1][0], length: match[1].length };
      indentedCode = false;
    } else if (!line.trim()) {
      if (indentedCode) {
        // Blank runs belong to code only when the next nonblank line continues its indentation.
        let next = index + 1;
        while (next < lines.length && !lines[next].trim()) next++;
        if (next < lines.length && INDENTED_CODE_RE.test(lines[next])) {
          index = next - 1;
          continue;
        }
      }
      append(start, index);
      start = index + 2;
      indentedCode = false;
    } else {
      indentedCode = INDENTED_CODE_RE.test(line);
    }
  }
  append(start, lines.length);
  return sections;
}

/** Unicode letters/numbers and underscores, case folded; no stemming or stop-word guesses. */
export function tokenizeBm25(text: string): string[] {
  return text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

/** Scores the whole page corpus, descending relevance with source-line ties; zero matches remain. */
export function rankSections<T extends MarkdownSection>(sections: readonly T[], query: string): T[] {
  const terms = [...new Set(tokenizeBm25(query))];
  const documents = sections.map((section) => {
    const tokens = tokenizeBm25(section.text);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    return { length: tokens.length, frequencies };
  });
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / (documents.length || 1) || 1;
  const idfs = new Map(terms.map((term) => {
    const frequency = documents.filter((doc) => doc.frequencies.has(term)).length;
    return [term, Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5))];
  }));
  return sections.map((section, index) => {
    const doc = documents[index];
    let score = 0;
    for (const term of terms) {
      const frequency = doc.frequencies.get(term) ?? 0;
      if (frequency) score += idfs.get(term)! * frequency * 2.5 / (frequency + 1.5 * (0.25 + 0.75 * doc.length / averageLength));
    }
    return { ...section, score };
  }).sort((a, b) => b.score - a.score || a.startLine - b.startLine);
}

export interface Bm25FilterResult {
  content: string;
  query: string;
  threshold: number;
  matchedSectionCount: number;
  totalSections: number;
  sections: MarkdownSection[];
}

/** Complete positive matches in source order. An empty selection is valid, never a fallback. */
export function filterMarkdownBm25(markdown: string, query: string, threshold = 1): Bm25FilterResult {
  if (!query.trim()) throw new Error("BM25 query must not be blank");
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("BM25 threshold must be finite and >= 0");
  const all = splitMarkdownSections(markdown);
  const sections = rankSections(all, query).filter((section) => section.score > 0 && section.score >= threshold)
    .sort((a, b) => a.startLine - b.startLine);
  return { content: sections.map((section) => section.text).join("\n\n"), query, threshold, matchedSectionCount: sections.length, totalSections: all.length, sections };
}
