/**
 * Selector resolution and drill-down text for saved crawl sessions.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CrawlSessionInfo } from "./cleanup";
import { buildManifestOverview } from "./crawlReadTool";

const MANIFEST_NAME = "crawl-manifest.json";

/** Numbered page lines printed before the explicit remainder. */
export const SESSION_PAGE_LIMIT = 20;

/** Cap for the optional request-detail line, so provenance stays bounded. */
const REQUEST_DETAIL_LIMIT = 400;

export type CrawlSessionSelection =
  | { session: CrawlSessionInfo; error?: undefined }
  | { session?: undefined; error: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function listValue(name: string, value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? `${name}=${JSON.stringify(value)}` : undefined;
}

/**
 * One or two bounded lines for the effective request and service behind a session.
 * Manifests without provenance produce no lines.
 */
export function formatRequestSummary(manifest: Record<string, unknown>): string[] {
  const request = asRecord(manifest.request);
  const service = asRecord(manifest.service);
  if (!request) return service ? [`Service: ${String(service.baseUrl ?? "unknown")}`] : [];

  const core = [
    `format=${String(request.format ?? "unknown")}`,
    `bypassCache=${request.bypassCache === true}`,
    `preferFitMarkdown=${request.preferFitMarkdown !== false}`,
  ];
  if (typeof request.waitFor === "number") core.push(`waitFor=${request.waitFor}ms`);
  if (request.jsCode === true) core.push("jsCode=true");

  const details: string[] = [];
  const deep = asRecord(request.deepCrawl);
  if (deep) {
    const filters = [
      deep.includeExternal === true ? "includeExternal=true" : undefined,
      listValue("includePatterns", deep.includePatterns),
      listValue("excludePatterns", deep.excludePatterns),
      listValue("allowedDomains", deep.allowedDomains),
      typeof deep.scoreThreshold === "number" ? `scoreThreshold=${deep.scoreThreshold}` : undefined,
    ].filter((value): value is string => value !== undefined);
    details.push(`deepCrawl strategy=${String(deep.strategy ?? "bfs")} maxDepth=${String(deep.maxDepth ?? "?")} maxPages=${String(deep.maxPages ?? "?")}${filters.length ? ` (${filters.join(", ")})` : ""}`);
  }
  const bm25 = asRecord(request.bm25);
  if (bm25) details.push(`bm25 query=${JSON.stringify(bm25.query)} threshold=${String(bm25.threshold)}`);
  const extractor = asRecord(request.extractor);
  if (extractor) details.push(`extractor=${String(extractor.name)} includeLinks=${extractor.includeLinks === true}`);
  if (service) details.push(`service=${String(service.baseUrl ?? "unknown")}`);

  const lines = [`Request: ${core.join(", ")}`];
  if (details.length) {
    const detail = details.join("; ");
    lines.push(`Details: ${detail.length > REQUEST_DETAIL_LIMIT ? `${detail.slice(0, REQUEST_DETAIL_LIMIT)}…` : detail}`);
  }
  return lines;
}

/**
 * Drill-down text for one session: header, bounded request summary, numbered
 * `URL → exact path` page lines (capped at SESSION_PAGE_LIMIT) and the manifest path.
 */
export function formatCrawlSessionDrillDown(session: CrawlSessionInfo, cwd: string): string {
  const manifestPath = join(session.path, MANIFEST_NAME);
  const header = [
    `# crawl session ${session.name}`,
    `Session: ${session.path}`,
    `Host: ${session.host ?? "unknown"}; pages: ${session.pageCount ?? "unknown"}; size: ${(session.sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
  ];
  if (session.timestamp) header.push(`Saved: ${session.timestamp}`);

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  } catch {
    return [...header, "", `Unreadable manifest: ${manifestPath}`].join("\n");
  }

  return [
    ...header,
    ...formatRequestSummary(manifest),
    "",
    buildManifestOverview(manifestPath, manifest, cwd, { numbered: true, maxPages: SESSION_PAGE_LIMIT }),
  ].join("\n");
}

/**
 * Resolve a 1-based listing number, exact session name or unique name prefix
 * against the newest-first listing printed by `/crawl-sessions`.
 */
export function resolveCrawlSession(selector: string, sessions: CrawlSessionInfo[], root: string): CrawlSessionSelection {
  const value = selector.trim();
  if (!value) return { error: `A selector is required: /crawl-sessions <n|name|prefix>. Searched ${root}.` };

  if (/^\d+$/.test(value)) {
    const session = sessions[Number(value) - 1];
    if (session) return { session };
    return { error: `No crawl session #${Number(value)} in ${root} (${sessions.length} session(s)). Run /crawl-sessions for the list.` };
  }

  const exact = sessions.find((session) => session.name === value);
  if (exact) return { session: exact };

  const matches = sessions.filter((session) => session.name.startsWith(value));
  if (matches.length === 1) return { session: matches[0] };
  if (matches.length > 1) {
    return { error: `Ambiguous crawl session selector "${value}" matches ${matches.length}: ${matches.map((match) => match.name).join(", ")}. Use a list number or the full session name.` };
  }
  return { error: `No crawl session matches "${value}" among ${sessions.length} session(s) in ${root}. Run /crawl-sessions for the list.` };
}
