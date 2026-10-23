/**
 * Progressive reader for saved crawl session pages.
 */

import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { extractWithTrafilatura } from "./trafilatura";
import { getDefaultOutputDir, containedArtifactPath, writeCrawlArtifact, type CrawlManifestPage } from "./saveOutput";
import { listCrawlSessions } from "./cleanup";
import { contentHash, evidenceView, jsonProjection, type ReadEvidence, type ManifestMetadata } from "./evidence";
import { capToolText, capToolTextDetailed } from "./presentation";
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
  extractor?: "trafilatura";
  format?: "markdown" | "text";
  includeLinks?: boolean;
  /** Resolve this URL through the manifest at path, or search saved sessions. */
  url?: string;
  mode?: CrawlReadMode;
  query?: string;
  maxChars?: number;
  offset?: number;
  limit?: number;
  /** UTF-16 source offset for revision-bound continuation. */
  charOffset?: number;
  /** Page index in bounded typed manifest metadata. */
  manifestOffset?: number;
  revision?: string;
  viewId?: string;
}

export const DEFAULT_MAX_CHARS = 6000;
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
  positions?: number[];
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
    parts.push(heading, "");
    options.positions?.push(parts.join("\n").length + 1);
    parts.push(chunk.text, "");
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

export async function executeCrawlRead(
  params: CrawlReadParams,
  options: { outputRoot: string; cwd?: string; pythonPath?: string; signal?: AbortSignal; deadlineAt?: number }
): Promise<{ text: string; details: Record<string, unknown> & { evidence: ReadEvidence } }> {
  options.signal?.throwIfAborted();
  if (!params.extractor) return readSavedContent(params, options);
  if (params.extractor !== "trafilatura") throw new Error("Unsupported extractor");
  if (params.format && !["markdown", "text"].includes(params.format)) throw new Error("Trafilatura supports Markdown/text only");
  if (!options.pythonPath) throw new Error("Configure trafilatura.pythonPath / CRAWL4AI_TRAFILATURA_PYTHON for optional crawl_read extraction");
  const resolved = resolveCrawlReadReference(params, getDefaultOutputDir(options.outputRoot), options.cwd ?? process.cwd());
  if (resolved.error) return readSavedContent(params, options);
  const root = findSessionRoot(resolved.absolutePath);
  if (!root) throw new Error("Article extraction requires a saved crawl manifest and original HTML");
  const manifestPath = join(root, MANIFEST_NAME);
  const manifest = readManifest(manifestPath).manifest!;
  const pages = manifest.pages as CrawlManifestPage[];
  const page = pages.find(page => [page.file, page.rawHtmlFile, page.originalMarkdownFile, ...(page.evidence?.views ?? []).map(view => view.path)]
    .some(file => typeof file === "string" && resolve(root, file) === resolved.absolutePath));
  if (!page?.rawHtmlFile || !page.evidence) throw new Error("Original HTML/evidence unavailable; read the preserved page without extractor");
  const htmlPath = containedArtifactPath(root, page.rawHtmlFile);
  const html = readFileSync(htmlPath, "utf8");
  const original = page.evidence.views.find(view => view.kind === "original_html" && view.sha256 === contentHash(html));
  if (!original) throw new Error("source_revision_changed: original HTML no longer matches its acquired snapshot");
  // Validate a requested snapshot before deriving; continuation reads use the returned derived path without extractor.
  const checked = readSavedContent({ ...params, extractor: undefined }, options);
  if (checked.details.error) return checked;
  let article: string;
  try {
    article = await extractWithTrafilatura({ pythonPath: options.pythonPath, html, format: params.format ?? "markdown", includeLinks: params.includeLinks,
      signal: options.signal, deadline: options.deadlineAt ?? Date.now() + 30000 });
    if (!article.trim()) throw new Error("Trafilatura found no extractable content");
  } catch (error) {
    options.signal?.throwIfAborted();
    throw new Error(`Article extraction failed; original remains available at ${htmlPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  options.signal?.throwIfAborted();
  if (contentHash(readFileSync(htmlPath, "utf8")) !== original.sha256) throw new Error("source_revision_changed: original HTML changed during extraction");
  const file = `${basename(page.rawHtmlFile)}.article-${contentHash(article)}.${params.format === "text" ? "txt" : "md"}`;
  const path = containedArtifactPath(root, file);
  if (!existsSync(path)) writeCrawlArtifact(root, file, article);
  else if (contentHash(readFileSync(path, "utf8")) !== contentHash(article)) throw new Error("source_revision_changed: derived artifact was modified");
  // Read the latest manifest after the await so concurrent derivations retain each other's views.
  const latest = readManifest(manifestPath).manifest!;
  const current = (latest.pages as CrawlManifestPage[]).find(item => item.evidence?.acquisitionId === page.evidence!.acquisitionId);
  if (!current?.evidence) throw new Error("source_revision_changed: acquired page no longer exists");
  const view = { ...evidenceView("trafilatura", article, true, path),
    callerScriptInfluenced: original.callerScriptInfluenced ?? page.evidence.callerScriptInfluenced,
    acquisitionId: original.acquisitionId, snapshotId: original.snapshotId, url: original.url,
    statusCode: original.statusCode, contentType: original.contentType };
  if (!current.evidence.views.some(item => item.id === view.id && item.path === path)) {
    current.evidence.views.push(view);
    latest.files = [...new Set([...(Array.isArray(latest.files) ? latest.files : []), file])];
    const pending = writeCrawlArtifact(root, `.article-${randomUUID()}.pending`, JSON.stringify(latest, null, 2));
    renameSync(pending, manifestPath);
  }
  const result = readSavedContent({ ...params, path, url: undefined, extractor: undefined, revision: undefined, viewId: undefined }, options);
  return jsonProjection({ ...result, details: { ...result.details, derivation: { path: htmlPath, revision: original.sha256 }, originalView: original } });
}

function readSavedContent(
  params: CrawlReadParams,
  options: { outputRoot: string; cwd?: string }
): { text: string; details: Record<string, unknown> & { evidence: ReadEvidence } } {
  for (const [name, value] of Object.entries({ maxChars: params.maxChars, offset: params.offset, limit: params.limit })) {
    if (value !== undefined && (!Number.isFinite(value) || value < (name === "maxChars" ? 0 : 1))) throw new Error(`${name} must be finite and nonnegative (line ranges start at 1)`);
  }
  if (params.charOffset !== undefined && (!Number.isInteger(params.charOffset) || params.charOffset < 0)) throw new Error("charOffset must be a nonnegative integer");
  if (params.manifestOffset !== undefined && (!Number.isInteger(params.manifestOffset) || params.manifestOffset < 0)) throw new Error("manifestOffset must be a nonnegative integer");
  const result = executeCrawlReadContent(params, options);
  const path = typeof result.details.path === "string" ? result.details.path : "";
  const root = path && existsSync(path) ? findSessionRoot(path) : undefined;
  const timestamp = root ? readManifest(join(root, MANIFEST_NAME)).manifest?.timestamp : undefined;
  const rendered = (params.url || (params.path && isUrlReference(params.path))) && !result.details.error
    ? `Chosen file: ${path}\n${typeof timestamp === "string" ? `Saved at: ${timestamp}\n` : ""}${result.text}` : result.text;
  const cappedOutput = capToolTextDetailed(rendered, path, params.maxChars ?? DEFAULT_MAX_CHARS);
  const text = cappedOutput.text;
  const prefixLength = rendered.length - result.text.length;
  const ranges = (Array.isArray(result.details.ranges) ? result.details.ranges : []) as ReadEvidence["ranges"];
  const delivered = ranges.flatMap(range => {
    const startInRendered = prefixLength + ((range as ReadEvidence["ranges"][number] & { renderedStart?: number }).renderedStart ?? -1);
    if (startInRendered < 0 || startInRendered >= text.length) return [];
    let length = 0;
    while (length < range.text.length && startInRendered + length < cappedOutput.sourceChars && text[startInRendered + length] === range.text[length]) length++;
    return length ? [{ start: range.start, end: range.start + length, unit: range.unit, text: range.text.slice(0, length) }] : [];
  });
  const revision = typeof result.details.revision === "string" ? result.details.revision : !result.details.error && path && existsSync(path) && statSync(path).isFile() ? contentHash(readFileSync(path, "utf8")) : "";
  const viewId = `artifact:${revision}`;
  const manifest = root ? readManifest(join(root, MANIFEST_NAME)).manifest : undefined;
  const pageEvidence = Array.isArray(manifest?.pages) ? (manifest.pages as Array<Record<string, unknown>>).find(page =>
    [page.file, page.rawHtmlFile, page.originalMarkdownFile, page.sourceFile, ...((page.evidence as { views?: Array<{path?: string}> } | undefined)?.views ?? []).map(view => view.path)].some(file => typeof file === "string" && resolve(root!, file) === path))?.evidence : undefined;
  const sourceChars = typeof result.details.charCount === "number" ? result.details.charCount : 0;
  const omitted = delivered.reduce((sum, range) => sum + range.end - range.start, 0) < sourceChars;
  const lastEnd = delivered.length ? Math.max(...delivered.map(range => range.end)) : 0;
  const manifestMetadata = basename(path) === MANIFEST_NAME && manifest && !result.details.error
    ? boundedManifestMetadata(path, revision, manifest, params.manifestOffset ?? 0) : undefined;
  const evidence: ReadEvidence = { manifestMetadata, version: 1, path, revision, viewId, ranges: delivered, omitted,
    nextCall: lastEnd > 0 && lastEnd < sourceChars ? { path, mode: "chunks", charOffset: lastEnd, revision, viewId, maxChars: params.maxChars ?? DEFAULT_MAX_CHARS, ...(params.query ? { query: params.query } : {}) } : null };
  return jsonProjection({ text, details: { ...result.details, ...evidence, evidence, manifestMetadata, pageEvidence, savedAt: timestamp, truncated: result.details.truncated === true || text !== rendered } });
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

  const revision = contentHash(content);
  const viewId = `artifact:${revision}`;
  if ((params.revision && params.revision !== revision) || (params.viewId && params.viewId !== viewId)) {
    return { text: "Error: source_revision_changed: artifact no longer matches the requested snapshot", details: { error: "source_revision_changed", path: absolutePath } };
  }
  if ((params.query && content.length > maxChars && !/^#{1,6}\s/m.test(content)) || (params.query && content.split("\n").some(line => line.length > maxChars)) || params.charOffset !== undefined) {
    const offset = params.charOffset ?? 0;
    const terms = params.query?.split(/\s+/).filter(Boolean) ?? [];
    const hits = terms.flatMap(term => {
      const matcher = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
      matcher.lastIndex = offset;
      const match = matcher.exec(content);
      return match ? [{ index: match.index, length: match[0].length }] : [];
    });
    const firstHit = hits.sort((a, b) => a.index - b.index)[0];
    const hit = firstHit?.index;
    if (terms.length && hit === undefined) return { text: "No further matching text in this snapshot.", details: { path: absolutePath, revision, viewId, charCount: content.length, ranges: [], omitted: true, nextCall: null } };
    const continuationOverhead = JSON.stringify({ path: absolutePath, mode: "chunks", query: params.query, charOffset: content.length, revision, viewId, maxChars }).length + 220;
    const bodyBudget = Math.max(0, Math.min(45000, maxChars - continuationOverhead));
    if (firstHit && bodyBudget < firstHit.length) return { text: "insufficient_budget: increase maxChars to return a complete query match and continuation metadata.", details: { path: absolutePath, revision, viewId, charCount: content.length, ranges: [], omitted: true, nextCall: null, error: "insufficient_budget" } };
    const start = hit !== undefined ? Math.max(offset, hit - Math.floor(Math.max(0, bodyBudget - (firstHit?.length ?? 0)) / 3)) : offset;
    const end = Math.min(content.length, start + bodyBudget);
    const body = content.slice(start, end);
    const nextCall = end < content.length && end > offset ? { path: absolutePath, mode: "chunks", query: params.query, charOffset: end, revision, viewId, maxChars } : null;
    const header = `# crawl_read source excerpt\nUTF-16 [${start},${end}) of ${content.length}; revision ${revision}\n`;
    return { text: header + body + (nextCall ? `\nNext call: crawl_read ${JSON.stringify(nextCall)}` : ""), details: { mode: "chunks", path: absolutePath, revision, viewId, charCount: content.length,
      ranges: [{ start, end, unit: "utf16", text: body, renderedStart: header.length }], omitted: start > 0 || end < content.length, truncated: start > 0 || end < content.length, nextCall,
      matchFound: terms.length ? hit !== undefined : undefined } };
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
    const positions: number[] = [];
    const text = formatChunksResult({
      positions,
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
        ranges: chunks.flatMap((c, index) => {
          const exact = c.text.split("\n… [excerpt")[0];
          const start = content.indexOf(exact, content.split("\n").slice(0, c.startLine - 1).join("\n").length);
          return start >= 0 ? [{ start, end: start + exact.length, unit: "utf16", text: exact, renderedStart: positions[index] }] : [];
        }),
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
    const startChar = content.split("\n").slice(0, windowed.startLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
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
        charCount: content.length,
        ranges: [{ start: startChar, end: startChar + windowed.text.length, unit: "utf16", text: windowed.text, renderedStart: header.length }],
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
      ranges: [{ start: 0, end: content.length, unit: "utf16", text: content, renderedStart: header.length }],
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

/** Complete objects only: never parse or expose a capped JSON presentation. */
function boundedManifestMetadata(path: string, revision: string, manifest: Record<string, unknown>, offset: number): ManifestMetadata {
  const records = (Array.isArray(manifest.pages) ? manifest.pages : []) as Array<Record<string, unknown>>;
  const pages: ManifestMetadata["pages"] = [];
  let bytes = 0;
  for (const record of records.slice(offset, offset + 20)) {
    const evidence = record.evidence as import("./evidence").PageEvidence | undefined;
    if (typeof record.url !== "string" || (evidence?.acquisitionId !== undefined && typeof evidence.acquisitionId !== "string") ||
        (evidence?.views !== undefined && (!Array.isArray(evidence.views) || evidence.views.some(view => !view || [view.id, view.kind, view.sha256].some(value => typeof value !== "string") || (view.path !== undefined && typeof view.path !== "string"))))) {
      throw new Error("invalid_manifest_metadata: malformed page identity or view reference");
    }
    const page = { url: typeof record.url === "string" ? record.url : "", acquisitionId: evidence?.acquisitionId,
      views: (evidence?.views ?? []).map(view => ({ id: view.id, kind: view.kind, sha256: view.sha256,
        ...(view.path ? { path: isAbsolute(view.path) ? view.path : resolve(dirname(path), view.path) } : {}) })) };
    const size = Buffer.byteLength(JSON.stringify(page));
    if (bytes + size > 32000) {
      if (!pages.length) throw new Error("manifest_metadata_page_too_large: one page exceeds the bounded metadata contract");
      break;
    }
    pages.push(page); bytes += size;
  }
  const nextOffset = offset + pages.length;
  return { version: 1, path, revision, pages, totalPages: records.length, complete: nextOffset >= records.length,
    nextCall: nextOffset < records.length ? { path, revision, manifestOffset: nextOffset } : null };
}
