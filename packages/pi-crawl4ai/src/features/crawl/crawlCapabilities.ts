/** Operator-owned acquisition routes. No local fetching/browser or POST retries. */
import type { Crawl4AIConfig } from "../../config";
import type { CrawlToolParams } from "./types";
import { executeCrawl, CrawlValidationError, validateCrawlResponse } from "./crawlCore";
import { CrawlOperationError, fetchCrawlApi } from "./http";

export interface CardExtractionSchema {
  name: string;
  baseSelector: string;
  fields: Array<{ name: string; selector: string; type: "text" | "attribute"; attribute?: string }>;
}
export interface AcquisitionOptions {
  waitForSelector?: string;
  selector?: string;
  excludeSelector?: string;
  extractionSchema?: CardExtractionSchema;
}
export type CrawlAction =
  | { type: "click"; selector: string }
  | { type: "scroll"; x?: number; y?: number }
  | { type: "wait"; milliseconds: number }
  | { type: "waitForSelector"; selector: string }
  | { type: "evaluate"; script: string };
export interface CrawlInteractParams extends AcquisitionOptions {
  url: string;
  actions?: CrawlAction[];
  scripts?: string[];
  format?: CrawlToolParams["format"];
  includeLinks?: boolean;
  save?: CrawlToolParams["save"];
  returnMode?: CrawlToolParams["returnMode"];
  maxCharsPerPage?: number;
  maxCharsPerCall?: number;
}

export class CrawlInteractionError extends Error {
  readonly code = "interaction_unconfirmed";
  readonly category = "transport_failure";
  readonly retryable = false;
  readonly operationOutcome = "unconfirmed";
  constructor(message: string) { super(message); this.name = "CrawlInteractionError"; }
}

export function acquisitionRequest(params: CrawlToolParams & AcquisitionOptions, timeoutMs: number) {
  return {
    urls: params.urls,
    ...(params.waitForSelector ? { waitFor: params.waitForSelector } : {}),
    ...(params.selector ? { selector: params.selector } : {}),
    ...(params.excludeSelector ? { excludeSelector: params.excludeSelector } : {}),
    ...(params.waitFor !== undefined ? { delayMs: params.waitFor } : {}),
    bypassCache: params.bypassCache ?? false,
    ...(params.extractionSchema ? { extractionSchema: params.extractionSchema } : {}),
    timeoutMs,
  };
}

export async function acquirePages(params: CrawlToolParams & AcquisitionOptions, config: Crawl4AIConfig, signal: AbortSignal): Promise<unknown> {
  return parseResponse(await fetchCrawlApi(config, "/acquire", {
    method: "POST", body: JSON.stringify(acquisitionRequest(params, config.timeout)),
  }, signal));
}

function parseResponse(raw: string, expectedInteractionUrl?: string): unknown {
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Malformed acquisition JSON response"); }
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) throw new Error("Malformed acquisition response envelope");
  if (expectedInteractionUrl && (data.results.length !== 1 || !data.results[0] || typeof data.results[0] !== "object" || data.results[0].url !== expectedInteractionUrl || typeof data.results[0].success !== "boolean" || (!data.results[0].success && (!data.results[0].error || typeof data.results[0].error.code !== "string" || typeof data.results[0].error.message !== "string")))) throw new CrawlInteractionError("Interaction response does not identify exactly one confirmed requested operation; do not automatically replay");
  for (const result of data.results) {
    if (result && typeof result === "object" && result.error && typeof result.error.message === "string") result.error_message = result.error.message;
  }
  if (data.results.length && data.results.every(result => result?.success === false)) {
    const first = data.results[0].error;
    const message = data.results.map(result => `${result.url}: ${result.error_message ?? "Acquisition failed"}`).join("; ");
    if (first?.operationOutcome === "unconfirmed") throw new CrawlInteractionError(message);
    const category = first?.category;
    throw new CrawlOperationError(["unsupported_capability", "website_blocked", "transport_failure", "provider_failure"].includes(category) ? category : "provider_failure", message);
  }
  return data;
}

export function validateAcquisitionOptions(params: AcquisitionOptions): void {
  for (const key of ["waitForSelector", "selector", "excludeSelector"] as const) {
    if (params[key] !== undefined && (typeof params[key] !== "string" || !params[key]!.trim())) throw new CrawlValidationError(`${key} must be a nonblank CSS selector`);
  }
  const schema = params.extractionSchema;
  if (schema !== undefined) {
    if (!schema || Object.keys(schema).some(key => !["name", "baseSelector", "fields"].includes(key)) || typeof schema.name !== "string" || !schema.name.trim() || typeof schema.baseSelector !== "string" || !schema.baseSelector.trim() || !Array.isArray(schema.fields) || !schema.fields.length) throw new CrawlValidationError("extractionSchema requires name, baseSelector and fields");
    const names = new Set<string>();
    for (const field of schema.fields) {
      if (!field || Object.keys(field).some(key => !["name", "selector", "type", "attribute"].includes(key)) || typeof field.name !== "string" || !field.name.trim() || names.has(field.name) || typeof field.selector !== "string" || !["text", "attribute"].includes(field.type) || (field.type === "attribute" && (typeof field.attribute !== "string" || !field.attribute.trim()))) throw new CrawlValidationError("Each extraction field needs a unique name, CSS selector, text/attribute type and attribute name when applicable");
      names.add(field.name);
    }
  }
}

export async function executeCrawlInteract(params: CrawlInteractParams, config: Crawl4AIConfig, options: { cwd: string; signal?: AbortSignal }) {
  validateAcquisitionOptions(params);
  if (!config.raw.capabilities?.interaction) throw new CrawlValidationError("Interaction capability is not configured; enable capabilities.interaction for the compatible operator service");
  if (typeof params.url !== "string") throw new CrawlValidationError("url must be an HTTP(S) URL");
  if (params.actions !== undefined && !Array.isArray(params.actions)) throw new CrawlValidationError("actions must be an array");
  if (params.scripts !== undefined && (!Array.isArray(params.scripts) || params.scripts.some(script => typeof script !== "string" || !script.trim()))) throw new CrawlValidationError("scripts must contain nonblank browser JavaScript");
  for (const action of params.actions ?? []) {
    if (!action || !["click", "scroll", "wait", "waitForSelector", "evaluate"].includes(action.type)) throw new CrawlValidationError("Unknown interaction action");
    if ((action.type === "click" || action.type === "waitForSelector") && (typeof action.selector !== "string" || !action.selector.trim())) throw new CrawlValidationError("click/waitForSelector requires a CSS selector");
    if (action.type === "evaluate" && (typeof action.script !== "string" || !action.script.trim())) throw new CrawlValidationError("evaluate requires browser JavaScript");
    if (action.type === "scroll" && [action.x, action.y].some(value => value !== undefined && !Number.isFinite(value))) throw new CrawlValidationError("Scroll coordinates must be finite");
    if (action.type === "wait" && (!Number.isFinite(action.milliseconds) || action.milliseconds < 0)) throw new CrawlValidationError("Wait milliseconds must be finite and nonnegative");
  }
  const { url, actions, scripts, waitForSelector, selector, excludeSelector, extractionSchema, ...delivery } = params;
  return executeCrawl({ ...delivery, urls: [url] }, config, {
    ...options,
    acquire: async signal => {
      if (signal.aborted) throw signal.reason;
      let raw: string;
      try {
        raw = await fetchCrawlApi(config, "/execute_js", {
          method: "POST", body: JSON.stringify({ url, actions, scripts, waitFor: waitForSelector, selector, excludeSelector, extractionSchema, timeoutMs: config.timeout }),
        }, signal);
      } catch (error) {
        // A rejected HTTP response establishes failure; transport/disconnect cannot
        // establish whether dispatched browser effects happened. Never retry.
        if (error && typeof error === "object" && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500) throw error;
        throw new CrawlInteractionError(`Interaction outcome unconfirmed; do not automatically replay: ${error instanceof Error ? error.message : String(error)}`);
      }
      let data: unknown;
      try { data = parseResponse(raw, url); validateCrawlResponse(data); }
      catch (error) {
        if (error instanceof CrawlOperationError || error instanceof CrawlInteractionError) throw error;
        throw new CrawlInteractionError(`Interaction outcome unconfirmed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const results = (data as { results: Array<{ success: boolean; interaction?: { outcome?: string; scriptHashes?: string[]; before?: { html?: string; url?: string } }; metadata?: { callerScriptInfluenced?: boolean } }> }).results;
      const ranScript = !!scripts?.length || actions?.some(action => action.type === "evaluate");
      if (results.some(result => result.success && (result.interaction?.outcome !== "confirmed" || typeof result.interaction.before?.html !== "string" || !result.interaction.before?.url || (ranScript && result.metadata?.callerScriptInfluenced !== true) || (scripts?.length && JSON.stringify(result.interaction.scriptHashes) !== JSON.stringify(scripts.map(script => contentHash(script))))))) throw new CrawlInteractionError("Interaction response lacks confirmed outcome or server-owned script provenance; do not automatically replay");
      return data;
    },
  });
}

/** Persist complete capability artifacts before publishing the shared manifest. */
export function persistCapabilityViews(result: import("./types").CrawlResult, sessionDir?: string): void {
  const evidence = result.evidence;
  if (!evidence) return;
  const influence = result.metadata?.callerScriptInfluenced === true;
  const snapshotId = result.metadata?.snapshotId;
  for (const view of evidence.views) Object.assign(view, { callerScriptInfluenced: influence, acquisitionId: evidence.acquisitionId, snapshotId, url: result.redirected_url ?? result.url, statusCode: evidence.statusCode, contentType: evidence.contentType });
  const add = (kind: string, content: string, influenced = influence, snapshot = snapshotId, sourceUrl = result.redirected_url ?? result.url) => {
    const view = { statusCode: evidence.statusCode, contentType: evidence.contentType, ...evidenceView(kind, content, ["selected_html", "structured"].includes(kind)), callerScriptInfluenced: influenced, acquisitionId: evidence.acquisitionId, snapshotId: snapshot, url: sourceUrl };
    if (sessionDir) view.path = writeCrawlArtifact(sessionDir, `${evidence.acquisitionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}-${kind}-${view.sha256}.txt`, content);
    evidence.views.push(view);
    return view;
  };
  if (result.selected_html !== undefined) add("selected_html", result.selected_html);
  if (result.extracted_content !== undefined) add("structured", typeof result.extracted_content === "string" ? result.extracted_content : JSON.stringify(result.extracted_content));
  const interaction = result.interaction;
  if (interaction) {
    const before = interaction.before;
    if (before && typeof before.html === "string") {
      const view = add("before_interaction_html", before.html, false, before.metadata?.snapshotId, before.url ?? "");
      view.statusCode = before.metadata?.statusCode ?? null;
      view.contentType = before.metadata?.contentType ?? null;
    }
    const actions = (interaction.actions ?? []).map(action => action.type === "evaluate" ? { type: action.type, scriptSha256: contentHash(action.script) } : action);
    add("interaction_result", JSON.stringify({ outcome: interaction.outcome, actions, scriptHashes: interaction.scriptHashes ?? [], results: interaction.results, before: before?.metadata, after: interaction.after?.metadata }), influence);
  }
  const document = result.document;
  if (document) {
    if (!Array.isArray(document.pages) || typeof document.originalBase64 !== "string" || typeof document.sha256 !== "string") throw new Error("Malformed document result");
    const binary = Buffer.from(document.originalBase64, "base64");
    const hash = createHash("sha256").update(binary).digest("hex");
    if (binary.byteLength > 10 * 1024 * 1024 || hash !== document.sha256 || !binary.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid or oversized original PDF artifact");
    const view = { id: `original_document:${hash}`, kind: "original_document", sha256: hash, chars: 0, lossy: false, callerScriptInfluenced: false, acquisitionId: evidence.acquisitionId, path: undefined as string | undefined };
    if (sessionDir) view.path = writeCrawlArtifact(sessionDir, `${evidence.acquisitionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}-${hash}.pdf`, binary);
    evidence.views.push(view);
    add("document_pages", JSON.stringify({ pages: document.pages, metadata: document.metadata, limitations: document.limitations }), false);
  }
}

import { createHash } from "node:crypto";
import { evidenceView, contentHash } from "./evidence";
import { writeCrawlArtifact } from "./saveOutput";
