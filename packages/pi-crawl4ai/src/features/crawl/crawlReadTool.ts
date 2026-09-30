/**
 * Progressive reader for saved crawl session pages.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Crawl4AIConfig } from "../../config";
import { getDefaultOutputDir, containedArtifactPath } from "./saveOutput";
import { listCrawlSessions } from "./cleanup";
import { capToolText } from "./presentation";
import {
  buildOutlineMarkdown,
  selectChunks,
  windowLines,
  type PageMeta,
} from "./outline";

export type CrawlReadMode = "outline" | "chunks" | "window" | "full";

export interface CrawlReadParams {
  /** Exact saved page path, crawl-manifest.json/session path, or a page URL. */
  path?: string;
  /** Resolve this URL through the manifest at path, or search saved sessions. */
  url?: string;
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
 * Resolve an exact file or session manifest, relative to cwd or the output root.
 * Exact files need no manifest; directories must identify a saved session.
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

  let absolutePath = isAbsolute(trimmed)
    ? normalize(trimmed)
    : resolve(cwd, trimmed);

  if (!existsSync(absolutePath)) {
    // try under output root
    const underRoot = resolve(cwd, outputRoot, trimmed);
    if (!existsSync(underRoot)) return { absolutePath, error: `File not found: ${trimmed}` };
    absolutePath = underRoot;
  }

  const stat = statSync(absolutePath);
  if (stat.isDirectory()) {
    // A session directory is most useful through its manifest first.
    const manifestPath = join(absolutePath, MANIFEST_NAME);
    if (existsSync(manifestPath)) return { absolutePath: manifestPath };

    return { absolutePath, error: `Directory has no crawl-manifest.json: ${trimmed}` };
  }

  return { absolutePath };
}

function findSessionRoot(filePath: string): string | undefined {
  let current = dirname(filePath);
  while (true) {
    if (existsSync(join(current, MANIFEST_NAME))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

interface ManifestPageRecord {
  url?: string;
  file?: string;
  outlineFile?: string;
  metaFile?: string;
}

function isUrlReference(value: string): boolean {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.hostname);
  } catch {
    return false;
  }
}

function urlsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    const a = new URL(left);
    const b = new URL(right);
    // Saved URLs occasionally differ only by a trailing root slash.
    const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/";
    return (
      a.protocol === b.protocol &&
      a.hostname === b.hostname &&
      a.port === b.port &&
      normalizePath(a.pathname) === normalizePath(b.pathname) &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}

function readManifest(manifestPath: string): {
  manifest?: Record<string, unknown>;
  error?: string;
} {
  try {
    containedArtifactPath(dirname(manifestPath), basename(manifestPath));
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Record<string, unknown>).pages)) {
      return { error: `Invalid crawl manifest: ${manifestPath}` };
    }
    return { manifest: parsed as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Could not read crawl manifest ${manifestPath}: ${message}` };
  }
}

function manifestPages(manifest: Record<string, unknown>): ManifestPageRecord[] {
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  return pages.map((page) => {
    const record = page && typeof page === "object" ? (page as Record<string, unknown>) : undefined;
    return {
      url: typeof record?.url === "string" ? record.url : undefined,
      file: typeof record?.file === "string" ? record.file : undefined,
      outlineFile: typeof record?.outlineFile === "string" ? record.outlineFile : undefined,
      metaFile: typeof record?.metaFile === "string" ? record.metaFile : undefined,
    };
  });
}

function manifestPathForReference(
  reference: string,
  outputRoot: string,
  cwd: string
): string | undefined {
  if (!reference || isUrlReference(reference)) return undefined;

  const absolute = isAbsolute(reference)
    ? normalize(reference)
    : resolve(cwd, reference);
  const candidates = [absolute];
  const underRoot = resolve(cwd, outputRoot, reference);
  if (underRoot !== absolute) candidates.push(underRoot);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const stat = statSync(candidate);
      if (stat.isDirectory()) {
        const directManifest = join(candidate, MANIFEST_NAME);
        if (existsSync(directManifest)) return directManifest;
        const sessionRoot = findSessionRoot(join(candidate, "__crawl_read_context__"));
        if (sessionRoot) return join(sessionRoot, MANIFEST_NAME);
        continue;
      }
      if (basename(candidate) === MANIFEST_NAME) return candidate;
      const sessionRoot = findSessionRoot(candidate);
      if (sessionRoot) return join(sessionRoot, MANIFEST_NAME);
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

function listManifestPaths(outputRoot: string, cwd: string): string[] {
  const root = resolve(cwd, outputRoot);
  if (!existsSync(root)) return [];

  try {
    if (statSync(root).isFile()) {
      return basename(root) === MANIFEST_NAME ? [root] : [];
    }
    const directManifest = join(root, MANIFEST_NAME);
    if (existsSync(directManifest)) return [directManifest];
    return listCrawlSessions(root).map(session => join(session.path, MANIFEST_NAME));
  } catch {
    return [];
  }
}

function resolveManifestPage(
  manifestPath: string,
  manifest: Record<string, unknown>,
  targetUrl: string
): { absolutePath: string; page?: ManifestPageRecord; error?: string } {
  const pages = manifestPages(manifest);
  const pageIndex = pages.findIndex((page) => page.url && urlsMatch(page.url, targetUrl));
  if (pageIndex < 0) {
    const validUrls = pages
      .map((page) => page.url)
      .filter((url): url is string => Boolean(url));
    return {
      absolutePath: "",
      error: `URL not found in crawl manifest: ${targetUrl}${validUrls.length ? `\nKnown URLs:\n${validUrls.map((url) => `- ${url}`).join("\n")}` : ""}`,
    };
  }

  const page = pages[pageIndex];
  if (!page.file) {
    return {
      absolutePath: "",
      error: `Manifest entry for ${targetUrl} has no page file`,
    };
  }

  const sessionRoot = dirname(manifestPath);
  let absolutePath: string;
  try { absolutePath = containedArtifactPath(sessionRoot, page.file); }
  catch (error) { return { absolutePath: "", error: String(error) }; }
  if (!isPathInside(sessionRoot, absolutePath)) {
    return {
      absolutePath: "",
      error: `Manifest page path escapes its session directory: ${page.file}`,
    };
  }
  if (!existsSync(absolutePath)) {
    return {
      absolutePath: "",
      error: `Manifest page file is missing for ${targetUrl}: ${absolutePath}`,
    };
  }

  return { absolutePath, page };
}

function displayPath(path: string, cwd: string): string {
  return relative(cwd, path) || path;
}

function formatValidArtifacts(outputRoot: string, cwd: string): string {
  const manifests = listManifestPaths(outputRoot, cwd);
  const artifacts: string[] = [];

  for (const manifestPath of manifests) {
    artifacts.push(displayPath(manifestPath, cwd));
    const loaded = readManifest(manifestPath);
    if (!loaded.manifest) continue;
    for (const page of manifestPages(loaded.manifest)) {
      if (!page.file) continue;
      const pagePath = resolve(dirname(manifestPath), page.file);
      try { containedArtifactPath(dirname(manifestPath), page.file); } catch { continue; }
      if (isPathInside(dirname(manifestPath), pagePath) && existsSync(pagePath)) {
        artifacts.push(displayPath(pagePath, cwd));
      }
    }
  }

  if (artifacts.length === 0) {
    return `No saved crawl-manifest.json or page files were found under ${displayPath(resolve(cwd, outputRoot), cwd)}. Results explicitly requested with save=false are not recoverable from disk.`;
  }

  const shown = artifacts.slice(0, 50).map((path) => `- ${path}`);
  const suffix = artifacts.length > shown.length ? `\n- … and ${artifacts.length - shown.length} more` : "";
  return [
    "Valid saved crawl paths (read the manifest first or use one exact page path):",
    ...shown,
    suffix,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Manifest outline: header plus one `URL → exact path` line per page.
 * Optional numbering and a page cap keep the session drill-down bounded;
 * the default (no options) output is unchanged.
 */
export function buildManifestOverview(
  manifestPath: string,
  manifest: Record<string, unknown>,
  cwd: string,
  options?: { numbered?: boolean; maxPages?: number }
): string {
  const pages = manifestPages(manifest);
  const lines = [
    "# crawl manifest",
    `Manifest: ${displayPath(manifestPath, cwd)}`,
    `Pages: ${typeof manifest.totalPages === "number" ? manifest.totalPages : pages.length}`,
    "",
    "Read one of these exact page paths with crawl_read; do not invent flattened filenames.",
  ];
  const pageLines: string[] = [];

  for (const page of pages) {
    if (!page.file) continue;
    const pagePath = resolve(dirname(manifestPath), page.file);
    try { containedArtifactPath(dirname(manifestPath), page.file); }
    catch { continue; }
    pageLines.push(`${options?.numbered ? `${pageLines.length + 1}. ` : "- "}${page.url ?? "(unknown URL)"} → ${pagePath}`);
  }

  const shown = options?.maxPages === undefined ? pageLines : pageLines.slice(0, options.maxPages);
  lines.push(...shown);
  if (shown.length < pageLines.length) lines.push(`- … and ${pageLines.length - shown.length} more`);

  return lines.join("\n");
}

function loadSidecars(contentPath: string): {
  outline?: string;
  meta?: PageMeta;
} {
  // Unsupported extensions (including native text) have no sidecar naming convention.
  const sidecarBase = /\.(?:md|html)$/i.test(contentPath) ? contentPath.replace(/\.(?:md|html)$/i, "") : undefined;
  const outlinePath = sidecarBase ? `${sidecarBase}.outline.md` : undefined;
  const metaPath = sidecarBase ? `${sidecarBase}.meta.json` : undefined;
  const result: {
    outline?: string;
    meta?: PageMeta;
  } = {};

  if (outlinePath && existsSync(outlinePath)) {
    try {
      const root = findSessionRoot(contentPath) ?? dirname(contentPath);
      containedArtifactPath(root, relative(root, outlinePath));
      result.outline = readFileSync(outlinePath, "utf-8");
    } catch {
      // ignore
    }
  }
  if (metaPath && existsSync(metaPath)) {
    try {
      const root = findSessionRoot(contentPath) ?? dirname(contentPath);
      containedArtifactPath(root, relative(root, metaPath));
      result.meta = JSON.parse(readFileSync(metaPath, "utf-8")) as PageMeta;
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

  // Keep the exact path once in the footer; long source URLs must not consume the reading budget.
  const shownUrl = url && url.length > 160 ? `${url.slice(0, 120)}… [abbreviated; full URL in saved metadata/manifest]` : url;
  const parts = [
    `# crawl_read chunks`,
    shownUrl ? `URL: ${shownUrl}` : undefined,
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

interface ResolvedCrawlReadReference {
  absolutePath: string;
  manifestPath?: string;
  manifest?: Record<string, unknown>;
  error?: string;
}

function resolveCrawlReadReference(
  params: CrawlReadParams,
  outputRoot: string,
  cwd: string
): ResolvedCrawlReadReference {
  const requestedPath = params.path?.trim();
  const requestedUrl = params.url?.trim() ||
    (requestedPath && isUrlReference(requestedPath) ? requestedPath : undefined);

  if (requestedUrl) {
    const contextManifest = requestedPath && !isUrlReference(requestedPath)
      ? manifestPathForReference(requestedPath, outputRoot, cwd)
      : undefined;
    if (requestedPath && !isUrlReference(requestedPath) && !contextManifest) return { absolutePath: "", error: `Explicit crawl context not found: ${requestedPath}` };
    const manifestPaths = contextManifest
      ? [contextManifest]
      : listManifestPaths(outputRoot, cwd);

    if (manifestPaths.length === 0) {
      return {
        absolutePath: "",
        error: `Could not resolve URL from saved crawl output: ${requestedUrl}\n${formatValidArtifacts(outputRoot, cwd)}`,
      };
    }

    let lastError: string | undefined;
    for (const manifestPath of manifestPaths) {
      const loaded = readManifest(manifestPath);
      if (!loaded.manifest) {
        lastError = loaded.error;
        continue;
      }
      const page = resolveManifestPage(manifestPath, loaded.manifest, requestedUrl);
      if (!page.error) {
        return {
          absolutePath: page.absolutePath,
          manifestPath,
          manifest: loaded.manifest,
        };
      }
      // A broken newest matching artifact must not silently become stale content.
      if (manifestPages(loaded.manifest).some(record => record.url && urlsMatch(record.url, requestedUrl))) return { absolutePath: "", manifestPath, error: page.error };
      lastError = page.error;
    }

    return {
      absolutePath: "",
      error: `${lastError ?? `URL not found in saved crawl output: ${requestedUrl}`}\n${formatValidArtifacts(outputRoot, cwd)}`,
    };
  }

  if (!requestedPath) {
    return {
      absolutePath: "",
      error: "path or url is required",
    };
  }

  const resolved = resolveReadablePath(requestedPath, outputRoot, cwd);
  if (resolved.error) {
    return {
      absolutePath: resolved.absolutePath,
      error: `${resolved.error}\n${formatValidArtifacts(outputRoot, cwd)}`,
    };
  }

  if (basename(resolved.absolutePath) === MANIFEST_NAME) {
    const loaded = readManifest(resolved.absolutePath);
    if (!loaded.manifest) {
      return { absolutePath: resolved.absolutePath, error: loaded.error };
    }
    return {
      absolutePath: resolved.absolutePath,
      manifestPath: resolved.absolutePath,
      manifest: loaded.manifest,
    };
  }

  return { absolutePath: resolved.absolutePath };
}

export function executeCrawlRead(
  params: CrawlReadParams,
  options: { outputRoot: string; cwd?: string }
): { text: string; details: Record<string, unknown> } {
  for (const [name, value] of Object.entries({ maxChars: params.maxChars, offset: params.offset, limit: params.limit })) {
    if (value !== undefined && (!Number.isFinite(value) || value < (name === "maxChars" ? 0 : 1))) throw new Error(`${name} must be finite and nonnegative (line ranges start at 1)`);
  }
  const result = executeCrawlReadContent(params, options);
  const path = typeof result.details.path === "string" ? result.details.path : "";
  const root = path && existsSync(path) ? findSessionRoot(path) : undefined;
  const timestamp = root ? readManifest(join(root, MANIFEST_NAME)).manifest?.timestamp : undefined;
  const rendered = (params.url || (params.path && isUrlReference(params.path))) && !result.details.error
    ? `Chosen file: ${path}\n${typeof timestamp === "string" ? `Saved at: ${timestamp}\n` : ""}${result.text}` : result.text;
  const text = capToolText(rendered, path, params.maxChars ?? DEFAULT_MAX_CHARS);
  return { text, details: { ...result.details, savedAt: timestamp, truncated: result.details.truncated === true || text !== rendered } };
}

function executeCrawlReadContent(
  params: CrawlReadParams,
  options: { outputRoot: string; cwd?: string }
): { text: string; details: Record<string, unknown> } {
  const mode: CrawlReadMode = params.mode ?? (params.query ? "chunks" : "outline");
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const cwd = options.cwd ?? process.cwd();
  const outputRoot = getDefaultOutputDir(options.outputRoot);

  const resolved = resolveCrawlReadReference(params, outputRoot, cwd);
  if (resolved.error) {
    return {
      text: `Error: ${resolved.error}`,
      details: { error: resolved.error, path: params.path, url: params.url },
    };
  }

  const absolutePath = resolved.absolutePath;
  let content: string;
  try {
    const root = findSessionRoot(absolutePath);
    if (root) containedArtifactPath(root, relative(root, absolutePath));
    else if (isPathInside(resolve(cwd, outputRoot), absolutePath)) containedArtifactPath(resolve(cwd, outputRoot), relative(resolve(cwd, outputRoot), absolutePath));
    content = readFileSync(absolutePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const helpful = `${message}\n${formatValidArtifacts(outputRoot, cwd)}`;
    return {
      text: `Error reading file: ${helpful}`,
      details: { error: helpful, path: absolutePath, url: params.url },
    };
  }

  const isManifest = basename(absolutePath) === MANIFEST_NAME;
  const sidecars = isManifest
    ? { outline: undefined, meta: undefined }
    : loadSidecars(absolutePath);
  const url = sidecars.meta?.url;
  const title = sidecars.meta?.title;
  const relDisplay = absolutePath;

  if (isManifest && resolved.manifest && mode === "outline") {
    const overview = buildManifestOverview(absolutePath, resolved.manifest, cwd);
    const capped = { text: overview, truncated: false };
    return {
      text: capped.text,
      details: {
        mode,
        path: absolutePath,
        displayPath: relDisplay,
        manifestPath: absolutePath,
        pageCount: manifestPages(resolved.manifest).length,
        truncated: capped.truncated,
        charCount: content.length,
        usedSidecarOutline: false,
      },
    };
  }

  if (mode === "outline") {
    const outline =
      sidecars.outline?.trim() ||
      buildOutlineMarkdown({ url, title, content });
    const capped = { text: outline, truncated: false };
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
        manifestPath: resolved.manifestPath,
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
    const capped = { text, truncated: false };
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
        manifestPath: resolved.manifestPath,
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
    const capped = { text: `${header}${windowed.text}`, truncated: false };
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
        manifestPath: resolved.manifestPath,
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
  const capped = { text: `${header}${content}`, truncated: false };
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
      manifestPath: resolved.manifestPath,
    },
  };
}

export function registerCrawlReadTool(pi: ExtensionAPI, config: Crawl4AIConfig): void {
  pi.registerTool(defineTool({
    name: "crawl_read",
    label: "Read Crawl Output",
    description:
      "Progressively read a saved crawl page without dumping the whole file into context. " +
      "The path may be an exact page path, crawl-manifest.json, session directory, or page URL; " +
      "use url with a manifest/session path to resolve a page. " +
      "Modes: outline (default), chunks (optional query), window (line range), full (hard-capped). " +
      "Prefer this over raw read for files under output-crawl4ai.",
    promptSnippet:
      "Read saved crawl pages or resolve a page URL through crawl-manifest.json via outline/chunks/window/full.",
    promptGuidelines: [
      "After a crawl that saved files, read crawl-manifest.json first or use an exact printed page path; never invent flattened filenames.",
      "You can pass a page URL in path, or pass url with a manifest/session path; missing paths are errors and list valid saved paths.",
      "Use chunks with a query for focused reading; outline is optional, and window/full expose exact saved text.",
      "Use mode=window or mode=full only when you need exact text; full is hard-capped by maxChars.",
    ],
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({
          description:
            "Exact path to a saved page, crawl-manifest.json, or session directory; may also be a page URL. Relative paths resolve from cwd or outputDir.",
        })
      ),
      url: Type.Optional(
        Type.String({
          description:
            "Page URL to resolve through the manifest at path, or search saved crawl sessions when path is omitted.",
        })
      ),
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
          minimum: 0,
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

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new Error("Crawl read cancelled");
      const result = executeCrawlRead(params, {
        outputRoot: config.raw.outputDir,
        cwd: ctx?.cwd ?? process.cwd(),
      });
      if (result.details.error) {
        // Throw so Pi records missing paths as tool errors rather than successful
        // results that merely contain an "Error:" string.
        throw new Error(result.text);
      }
      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  }));
}
