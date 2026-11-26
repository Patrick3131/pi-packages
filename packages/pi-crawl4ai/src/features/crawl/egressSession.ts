/**
 * Server-owned sticky egress lanes for one logical crawl call.
 *
 * The extension never picks a lane, a port or an exit: it asks the operator service
 * to start one lane, forwards the opaque handle it returns to every remaining
 * 3-URL chunk, and passes a caller-supplied handle back verbatim. Lane identity,
 * idle TTL, cooldown and the per-lane request budget stay on the server.
 */
import type { Crawl4AIConfig } from "../../config";
import { CrawlOperationError, type CrawlErrorCategory } from "./http";

/** Wire descriptor accepted by the operator acquisition route. */
export interface CrawlEgressRequest { action: "start" | "keep"; handle?: string }

/** Server receipt echoed for a lane, including the handle a later call can resume. */
export interface CrawlEgressReceipt { handle: string; fresh?: boolean; expiresAt?: string }

/** A lane that was already started once in this logical call. */
export interface RequestedEgressLane { handle?: string }

const EGRESS_ERROR_CODES = [
  "egress_unavailable",
  "egress_unknown_handle",
  "egress_lane_cooldown",
  "egress_lane_exhausted",
] as const;
type EgressErrorCode = typeof EGRESS_ERROR_CODES[number];

const EGRESS_FAILURES: Record<EgressErrorCode, { category: CrawlErrorCategory; message: string }> = {
  egress_unavailable: {
    category: "unsupported_capability",
    message: "Sticky egress lanes are not enabled on the configured crawl service; omit egressSession to use the default rotating egress",
  },
  egress_unknown_handle: {
    category: "validation_error",
    message: "The egressSession handle is unknown or expired; omit egressSession, or start a new lane with egressSession=true",
  },
  egress_lane_cooldown: {
    category: "resource_limit",
    message: "That egress lane is in cooldown after failures; retry later, or start a new lane with egressSession=true",
  },
  egress_lane_exhausted: {
    category: "resource_limit",
    message: "The egress lane reached its request budget and self-released; continue with egressSession=true for a new lane or omit egressSession",
  },
};

/**
 * Normalizes the tool field. Only type/nonblank checks happen here: the server
 * validates lane handles and owns their lifecycle.
 */
export function requestedEgressLane(value: unknown): RequestedEgressLane | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return {};
  if (typeof value === "string") {
    if (!value.trim()) throw new Error("egressSession handle must not be blank");
    return { handle: value };
  }
  throw new Error("egressSession must be true to start a lane or a lane handle returned by an earlier call");
}

/** First chunk starts or resumes; later chunks always keep the live lane. */
export function egressRequest(lane: RequestedEgressLane, liveHandle?: string): CrawlEgressRequest {
  const handle = liveHandle ?? lane.handle;
  return handle ? { action: "keep", handle } : { action: "start" };
}

/**
 * Refusals are pre-dispatch: a deep crawl, DeepSeek Fetch or a service without the
 * acquisition capability cannot carry a lane, and silently ignoring the field
 * would report rotation as if it were a sticky exit.
 */
export function validateEgressSession(
  params: { egressSession?: unknown; deepCrawl?: unknown; fallback?: unknown },
  config: Crawl4AIConfig,
): void {
  if (!requestedEgressLane(params.egressSession)) return;
  if (params.deepCrawl) {
    throw new Error("egressSession cannot be combined with deepCrawl; deep traversal keeps pooled contexts and rotating egress. Omit egressSession for discovery, then acquire the selected pages.");
  }
  if (params.fallback) {
    throw new Error("egressSession cannot be combined with fallback=true; DeepSeek Fetch selects a different provider and has no crawl-service egress lane.");
  }
  if (!config.raw.capabilities?.acquisition) {
    throw new CrawlOperationError("unsupported_capability", "egressSession requires capabilities.acquisition on a compatible operator service; the legacy /crawl route cannot carry an egress lane.");
  }
}

/** Reads the receipt without inventing or normalizing lane identity. */
export function readEgressReceipt(data: unknown): CrawlEgressReceipt | undefined {
  if (!data || typeof data !== "object" || !("egress" in data)) return undefined;
  const raw = (data as { egress?: unknown }).egress;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Malformed acquisition egress receipt");
  const { handle, fresh, expiresAt } = raw as Record<string, unknown>;
  if (typeof handle !== "string" || !handle.trim()) throw new Error("Malformed acquisition egress receipt");
  if (fresh !== undefined && typeof fresh !== "boolean") throw new Error("Malformed acquisition egress receipt");
  if (expiresAt !== undefined && typeof expiresAt !== "string") throw new Error("Malformed acquisition egress receipt");
  return { handle, ...(fresh !== undefined ? { fresh } : {}), ...(expiresAt !== undefined ? { expiresAt } : {}) };
}

/**
 * Lane refusals stay typed whether the service reports them as a per-page error or
 * as an HTTP refusal body, and never become an automatic retry.
 */
export function mapEgressFailure(error: unknown): CrawlOperationError | undefined {
  const code = observedEgressCode(error);
  if (!code) return undefined;
  const failure = EGRESS_FAILURES[code];
  const operation = error instanceof CrawlOperationError ? error : undefined;
  // Already translated per page: keep the single corrective message.
  if (operation?.serverCode === code && operation.code === failure.category) return operation;
  return new CrawlOperationError(failure.category, `${failure.message} (${code})`, operation?.status, {
    serverCode: code,
    phase: operation?.phase,
    retryable: false,
  });
}

function observedEgressCode(error: unknown): EgressErrorCode | undefined {
  const candidates = error && typeof error === "object"
    ? [(error as { serverCode?: unknown }).serverCode, (error as { message?: unknown }).message]
    : [error];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const code = EGRESS_ERROR_CODES.find(value => candidate.includes(value));
    if (code) return code;
  }
  return undefined;
}
