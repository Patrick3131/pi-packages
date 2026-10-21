import { Type, type Static } from "typebox";
import { createHash, randomUUID } from "node:crypto";
import type { CrawlResult } from "./types";
export const EvidenceViewSchema = Type.Object({
  callerScriptInfluenced: Type.Optional(Type.Boolean()), acquisitionId: Type.Optional(Type.String()), snapshotId: Type.Optional(Type.String()), url: Type.Optional(Type.String()), statusCode: Type.Optional(Type.Union([Type.Number(), Type.Null()])), contentType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  id: Type.String(), kind: Type.String(), path: Type.Optional(Type.String()), sha256: Type.String(), chars: Type.Integer(), lossy: Type.Boolean(),
});
export const PageEvidenceSchema = Type.Object({
  url: Type.String(), finalUrl: Type.String(), acquisitionId: Type.String(), acquiredAt: Type.String(), statusCode: Type.Union([Type.Number(), Type.Null()]), contentType: Type.Union([Type.String(), Type.Null()]),
  usability: Type.Union([Type.Literal("usable"), Type.Literal("unusable"), Type.Literal("unknown")]), reasons: Type.Array(Type.String()),
  callerScriptInfluenced: Type.Optional(Type.Boolean()), verifiedRedirects: Type.Optional(Type.Array(Type.Object({ from: Type.String(), to: Type.String() }))),
  resources: Type.Optional(Type.Object({ links: Type.Integer(), images: Type.Union([Type.Integer(), Type.Null()]), tables: Type.Union([Type.Integer(), Type.Null()]), sourceViewId: Type.String() })),
  delivery: Type.Optional(Type.Object({ ranges: Type.Array(Type.Object({ start: Type.Integer(), end: Type.Integer(), unit: Type.Literal("utf16") })), omitted: Type.Boolean(), nextCall: Type.Union([Type.Object({ path: Type.String(), mode: Type.Literal("chunks"), charOffset: Type.Integer(), revision: Type.String(), viewId: Type.String() }), Type.Null()]) })),
  cachedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  cacheStatus: Type.Union([Type.Literal("unknown"), Type.Literal("hit"), Type.Literal("miss"), Type.Literal("bypass")]), views: Type.Array(EvidenceViewSchema),
});
export const CrawlEvidenceSchema = Type.Object({ version: Type.Literal(1), pages: Type.Array(PageEvidenceSchema) });
export type PageEvidence = Static<typeof PageEvidenceSchema>;
export type CrawlEvidence = Static<typeof CrawlEvidenceSchema>;
export function contentHash(content: string): string { return createHash("sha256").update(content).digest("hex"); }
export function evidenceView(kind: string, content: string, lossy = false, path?: string) {
  const sha256 = contentHash(content);
  return { id: `${kind}:${sha256}`, kind, sha256, chars: content.length, lossy, ...(path ? { path } : {}) };
}
function cacheTimestamp(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function pageEvidence(result: CrawlResult, content: string): PageEvidence {
  const reasons: string[] = [];
  if (!result.success) reasons.push(result.error_message ?? "acquisition_failed");
  if (result.status_code !== undefined && (result.status_code < 200 || result.status_code >= 400)) reasons.push(`http_${result.status_code}`);
  if (!content.trim()) reasons.push("empty_requested_content");
  const contentType = Object.entries(result.response_headers ?? {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? null;
  return { url: result.url, finalUrl: result.redirected_url ?? result.url, acquisitionId: result.metadata?.acquisitionId ?? randomUUID(), acquiredAt: result.metadata?.observedAt ?? new Date().toISOString(), statusCode: result.status_code ?? null, contentType,
    callerScriptInfluenced: result.metadata?.callerScriptInfluenced, verifiedRedirects: result.metadata?.verifiedRedirects,
    usability: reasons.length ? "unusable" : "usable", reasons, cachedAt: cacheTimestamp(result.cached_at), cacheStatus: result.metadata?.cacheStatus ?? result.cache_status ?? "unknown", views: [] };
}

export const SourceRangeSchema = Type.Object({ start: Type.Integer({ minimum: 0 }), end: Type.Integer({ minimum: 0 }), unit: Type.Literal("utf16"), text: Type.String() });
export const ReadEvidenceSchema = Type.Object({
  version: Type.Literal(1), path: Type.String(), revision: Type.String(), viewId: Type.String(), ranges: Type.Array(SourceRangeSchema), omitted: Type.Boolean(),
  nextCall: Type.Union([Type.Object({ path: Type.String(), mode: Type.Literal("chunks"), charOffset: Type.Integer(), revision: Type.String(), viewId: Type.String(), maxChars: Type.Number(), query: Type.Optional(Type.String()) }), Type.Null()]),
});
export type ReadEvidence = Static<typeof ReadEvidenceSchema>;

/** Native durable tool/state values must be strict JSON; optional fields are absent. */
export function jsonProjection<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
