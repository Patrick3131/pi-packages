/**
 * Progressive reader for saved crawl session pages.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { getDefaultOutputDir } from "./saveOutput";
import {
  buildOutlineMarkdown,
  selectChunks,
  truncateToBudget,
  windowLines,
  type PageMeta,
} from "./outline";

export type CrawlReadMode = "outline" | "chunks" | "window" | "full";

export interface CrawlReadParams {
  path: string;
  mode?: CrawlReadMode;
  query?: string;
  maxChars?: number;
  offset?: number;
  limit?: number;
}

const DEFAULT_MAX_CHARS = 6000;
const MANIFEST_NAME = "crawl-manifest.json";

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/**
 * Resolve a user-provided path to a readable markdown/html file under output root when relative.
 * Absolute paths are allowed only if they exist and look like crawl artifacts (have sibling/ancestor manifest optional).
 */
export function resolveReadablePath(
  inputPath: string,
  outputRoot: string,
  cwd = process.cwd()
): { absolutePath: string; error?: string } {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return { absolutePath: "", error: "path is required" };
  }

  const absolutePath = isAbsolute(trimmed)
    ? normalize(trimmed)
    : resolve(cwd, trimmed);

  if (!existsSync(absolutePath)) {
    // try under output root
    const underRoot = resolve(cwd, outputRoot, trimmed);
    if (existsSync(underRoot)) {
      return { absolutePath: underRoot };
    }
    return { absolutePath, error: `File not found: ${trimmed}` };
  }

  const stat = statSync(absolutePath);
  if (stat.isDirectory()) {
    // Prefer index.md / first .md in domain folder
    const indexMd = join(absolutePath, "index.md");
    if (existsSync(indexMd)) return { absolutePath: indexMd };
    try {
      const firstMd = readdirSync(absolutePath).find((name) => name.endsWith(".md"));
      if (firstMd) return { absolutePath: join(absolutePath, firstMd) };
    } catch {
      // ignore
    }
    return { absolutePath, error: `Path is a directory without markdown files: ${trimmed}` };
  }

  return { absolutePath };
}

function findSessionRoot(filePath: string): string | undefined {
  let current = dirname(filePath);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(current, MANIFEST_NAME))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function loadSidecars(contentPath: string): {
  outline?: string;
  meta?: PageMeta;
  sessionManifest?: Record<string, unknown>;
} {
  const outlinePath = contentPath.replace(/\.md$/i, ".outline.md").replace(/\.html$/i, ".outline.md");
  const metaPath = contentPath.replace(/\.md$/i, ".meta.json").replace(/\.html$/i, ".meta.json");
  const result: {
    outline?: string;
    meta?: PageMeta;
    sessionManifest?: Record<string, unknown>;
  } = {};

  if (existsSync(outlinePath)) {
    try {
      result.outline = readFileSync(outlinePath, "utf-8");
    } catch {
      // ignore
    }
  }
  if (existsSync(metaPath)) {
    try {
      result.meta = JSON.parse(readFileSync(metaPath, "utf-8")) as PageMeta;
    } catch {
      // ignore
    }
  }
  const sessionRoot = findSessionRoot(contentPath);
  if (sessionRoot) {
    try {
      result.sessionManifest = JSON.parse(
        readFileSync(join(sessionRoot, MANIFEST_NAME), "utf-8")
      ) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return result;
}

function formatChunksResult(options: {
  path: string;
  url?: string;
  query?: string;
  chunks: ReturnType<typeof selectChunks>;
  maxChars: number;
  totalChars: number;
}): string {
  const { path, url, query, chunks, maxChars, totalChars } = options;
  if (chunks.length === 0) {
    return [
      `# crawl_read chunks`,
      `File: ${path}`,
      url ? `URL: ${url}` : undefined,
      query ? `Query: ${query}` : undefined,
      `No matching chunks (file ${totalChars} chars). Try mode=outline or a broader query.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const parts = [
    `# crawl_read chunks`,
    `File: ${path}`,
    url ? `URL: ${url}` : undefined,
    query ? `Query: ${query}` : undefined,
    `Showing ${chunks.length} section(s); file ${totalChars} chars; budget ${maxChars}.`,
    "",
  ].filter(Boolean) as string[];

  for (const chunk of chunks) {
    const heading = chunk.heading
      ? `## ${chunk.heading} (L${chunk.startLine}–${chunk.endLine}${chunk.score ? `, score ${chunk.score.toFixed(2)}` : ""})`
      : `## Section L${chunk.startLine}–${chunk.endLine}`;
    parts.push(heading, "", chunk.text, "");
  }

  parts.push(`Full file: ${path}`);
  return parts.join("\n");
}

export function executeCrawlRead(
  params: CrawlReadParams,
  options: { outputRoot: string; cwd?: string }
): { text: string; details: Record<string, unknown> } {
  const mode: CrawlReadMode = params.mode ?? (params.query ? "chunks" : "outline");
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const cwd = options.cwd ?? process.cwd();
  const outputRoot = getDefaultOutputDir(options.outputRoot);

  const resolved = resolveReadablePath(params.path, outputRoot, cwd);
  if (resolved.error) {
    return {
      text: `Error: ${resolved.error}`,
      details: { error: resolved.error, path: params.path },
    };
  }

  const absolutePath = resolved.absolutePath;
  let content: string;
  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: `Error reading file: ${message}`,
      details: { error: message, path: absolutePath },
    };
  }

  const sidecars = loadSidecars(absolutePath);
  const url = sidecars.meta?.url;
  const title = sidecars.meta?.title;
  const relDisplay = relative(cwd, absolutePath) || absolutePath;

  if (mode === "outline") {
    const outline =
      sidecars.outline?.trim() ||
      buildOutlineMarkdown({ url, title, content });
    const capped = truncateToBudget(outline, maxChars);
    return {
      text: capped.text,
      details: {
        mode,
        path: absolutePath,
        displayPath: relDisplay,
        url,
        title,
        truncated: capped.truncated,
        charCount: content.length,
        usedSidecarOutline: Boolean(sidecars.outline?.trim()),
      },
    };
  }

  if (mode === "chunks") {
    const chunks = selectChunks({
      markdown: content,
      query: params.query,
      maxChars,
    });
    const text = formatChunksResult({
      path: relDisplay,
      url,
      query: params.query,
      chunks,
      maxChars,
      totalChars: content.length,
    });
    const capped = truncateToBudget(text, maxChars + 800); // allow small header overhead
    return {
      text: capped.text,
      details: {
        mode,
        path: absolutePath,
        displayPath: relDisplay,
        url,
        title,
        query: params.query,
        chunkCount: chunks.length,
        truncated: capped.truncated,
        charCount: content.length,
        chunks: chunks.map((c) => ({
          id: c.id,
          heading: c.heading,
          startLine: c.startLine,
          endLine: c.endLine,
          score: c.score,
          chars: c.text.length,
        })),
      },
    };
  }

  if (mode === "window") {
    const offset = params.offset ?? 1;
    const limit = params.limit ?? 80;
    const windowed = windowLines(content, offset, limit);
    const header = [
      `# crawl_read window`,
      `File: ${relDisplay}`,
      url ? `URL: ${url}` : undefined,
      `Lines ${windowed.startLine}–${windowed.endLine} of ${windowed.totalLines}`,
      "",
    ]
      .filter(Boolean)
      .join("\n");
    const capped = truncateToBudget(`${header}${windowed.text}`, maxChars);
    return {
      text: capped.text,
      details: {
        mode,
        path: absolutePath,
        displayPath: relDisplay,
        url,
        startLine: windowed.startLine,
        endLine: windowed.endLine,
        totalLines: windowed.totalLines,
        truncated: capped.truncated,
      },
    };
  }

  // full
  const header = [
    `# crawl_read full`,
    `File: ${relDisplay}`,
    url ? `URL: ${url}` : undefined,
    title ? `Title: ${title}` : undefined,
    `Chars: ${content.length}`,
    "",
  ]
    .filter(Boolean)
    .join("\n");
  const capped = truncateToBudget(`${header}${content}`, maxChars);
  return {
    text: capped.text,
    details: {
      mode: "full",
      path: absolutePath,
      displayPath: relDisplay,
      url,
      title,
      truncated: capped.truncated,
      charCount: content.length,
      maxChars,
    },
  };
}

export function registerCrawlReadTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool({
    name: "crawl_read",
    label: "Read Crawl Output",
    description:
      "Progressively read a saved crawl page without dumping the whole file into context. " +
      "Modes: outline (default), chunks (optional query), window (line range), full (hard-capped). " +
      "Prefer this over raw read for files under output-crawl4ai.",
    promptSnippet:
      "Read saved crawl pages via outline/chunks/window/full with a char budget; use query for relevant sections.",
    promptGuidelines: [
      "After a crawl that saved files, use crawl_read instead of raw read on crawl outputs.",
      "Start with mode=outline, then mode=chunks with a query for the specific question.",
      "Use mode=window or mode=full only when you need exact text; full is hard-capped by maxChars.",
    ],
    parameters: Type.Object({
      path: Type.String({
        description:
          "Path to a saved crawl page (.md) or session file. Relative paths resolve from cwd or outputDir.",
      }),
      mode: Type.Optional(
        Type.Union(
          [
            Type.Literal("outline"),
            Type.Literal("chunks"),
            Type.Literal("window"),
            Type.Literal("full"),
          ],
          {
            description:
              "outline (default without query), chunks (default with query), window, or full",
          }
        )
      ),
      query: Type.Optional(
        Type.String({
          description: "Relevance query for mode=chunks (keyword ranking over sections)",
        })
      ),
      maxChars: Type.Optional(
        Type.Number({
          description: `Max characters returned (default ${DEFAULT_MAX_CHARS})`,
          minimum: 500,
        })
      ),
      offset: Type.Optional(
        Type.Number({
          description: "1-based start line for mode=window (default 1)",
          minimum: 1,
        })
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Number of lines for mode=window (default 80)",
          minimum: 1,
        })
      ),
    }),

    async execute(_toolCallId: string, params: CrawlReadParams) {
      const result = executeCrawlRead(params, {
        outputRoot: config.raw.outputDir,
        cwd: process.cwd(),
      });
      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  } as any);
}

// silence unused in case tree-shaking lint
void isPathInside;
