import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { estimateTokens } from "./parser.js";
import { normalizeProviderPayload } from "./provider-normalization.js";
import type {
  ModelSelectionRecord,
  PayloadCaptureManifest,
  PayloadCaptureSource,
  PayloadCaptureState,
  PayloadVisibility,
} from "./types.js";

export const PAYLOAD_CAPTURE_ENTRY_TYPE = "pi-context-inspector:payload-capture";
export const MODEL_SELECT_ENTRY_TYPE = "pi-context-inspector:model-select";

const MAX_PREVIEW_CHARS = 4000;
const MAX_STRING_CHARS = 20000;

let state: PayloadCaptureState = {
  captures: [],
  modelSelections: [],
};

function getModelId(model: unknown): string | undefined {
  if (!model || typeof model !== "object") {
    return undefined;
  }
  const maybeModel = model as { id?: string; name?: string };
  return maybeModel.id ?? maybeModel.name;
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}\n… [truncated ${String(value.length - MAX_STRING_CHARS)} chars]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return "[function omitted]";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/authorization|api[_-]?key|token|secret|password/i.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = toSerializable(child, seen);
  }
  return output;
}

function ensureCaptureDir(ctx: ExtensionContext): { dir: string; persisted: boolean } {
  const sessionId = ctx.sessionManager.getSessionId();
  const projectDir = path.join(ctx.cwd, ".pi", "context-inspector", sessionId, "captures");
  try {
    fs.mkdirSync(projectDir, { recursive: true });
    return { dir: projectDir, persisted: true };
  } catch {
    const tmpDir = path.join(os.tmpdir(), "pi-context-inspector", sessionId, "captures");
    fs.mkdirSync(tmpDir, { recursive: true });
    return { dir: tmpDir, persisted: false };
  }
}

function createCaptureId(): string {
  return `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPreview(serialized: string): string {
  return serialized.length > MAX_PREVIEW_CHARS
    ? `${serialized.slice(0, MAX_PREVIEW_CHARS)}\n… [truncated ${String(serialized.length - MAX_PREVIEW_CHARS)} chars]`
    : serialized;
}

function sortByTimestamp<T extends { capturedAt?: string; changedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = a.capturedAt ?? a.changedAt ?? "";
    const right = b.capturedAt ?? b.changedAt ?? "";
    return left.localeCompare(right);
  });
}

function dedupeCaptures(items: PayloadCaptureManifest[]): PayloadCaptureManifest[] {
  const byId = new Map<string, PayloadCaptureManifest>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return sortByTimestamp([...byId.values()]);
}

function dedupeModelSelections(items: ModelSelectionRecord[]): ModelSelectionRecord[] {
  const seen = new Set<string>();
  const ordered = sortByTimestamp(items);
  return ordered.filter((item) => {
    const key = `${item.changedAt}:${item.source}:${item.modelId ?? ""}:${item.previousModelId ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function visibilityFromNormalization(status: PayloadCaptureManifest["normalizationStatus"]): PayloadVisibility {
  return status === "full" ? "exact-payload" : "partial-payload";
}

export function resetPayloadCaptureState(): void {
  state = { captures: [], modelSelections: [] };
}

export function restorePayloadCaptureState(ctx: ExtensionContext): PayloadCaptureState {
  const branchEntries = ctx.sessionManager.getBranch();
  const captures: PayloadCaptureManifest[] = [];
  const modelSelections: ModelSelectionRecord[] = [];

  for (const entry of branchEntries) {
    if (entry.type !== "custom") {
      continue;
    }
    if (entry.customType === PAYLOAD_CAPTURE_ENTRY_TYPE && entry.data) {
      captures.push(entry.data as PayloadCaptureManifest);
    }
    if (entry.customType === MODEL_SELECT_ENTRY_TYPE && entry.data) {
      modelSelections.push(entry.data as ModelSelectionRecord);
    }
  }

  state = {
    captures: dedupeCaptures(captures),
    modelSelections: dedupeModelSelections(modelSelections),
  };

  return getPayloadCaptureState();
}

export function getPayloadCaptureState(): PayloadCaptureState {
  return {
    captures: [...state.captures],
    modelSelections: [...state.modelSelections],
  };
}

export function getLatestPayloadCapture(): PayloadCaptureManifest | undefined {
  return state.captures[state.captures.length - 1];
}

export function loadRawPayload(manifest: PayloadCaptureManifest | undefined): unknown {
  if (!manifest?.rawPayloadPath) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(manifest.rawPayloadPath, "utf8"));
  } catch {
    return undefined;
  }
}

export function recordModelSelection(pi: ExtensionAPI, event: {
  source: "set" | "cycle" | "restore";
  model?: unknown;
  previousModel?: unknown;
}): ModelSelectionRecord {
  const record: ModelSelectionRecord = {
    version: 1,
    changedAt: new Date().toISOString(),
    source: event.source,
    modelId: getModelId(event.model),
    previousModelId: getModelId(event.previousModel),
  };
  state.modelSelections = dedupeModelSelections([...state.modelSelections, record]);
  pi.appendEntry(MODEL_SELECT_ENTRY_TYPE, record);
  return record;
}

export function captureProviderPayloadSnapshot(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  payload: unknown,
  source: PayloadCaptureSource = "before_provider_request"
): PayloadCaptureManifest {
  const serializablePayload = toSerializable(payload);
  const serialized = JSON.stringify(serializablePayload, null, 2);
  const hadTransform = serializablePayload !== payload;
  const { dir, persisted } = ensureCaptureDir(ctx);
  const id = createCaptureId();
  const rawPayloadPath = path.join(dir, `${id}.json`);
  fs.writeFileSync(rawPayloadPath, `${serialized}\n`, "utf8");

  const normalization = normalizeProviderPayload(serializablePayload);
  const usage = ctx.getContextUsage();
  const manifest: PayloadCaptureManifest = {
    version: 1,
    id,
    capturedAt: new Date().toISOString(),
    source,
    cwd: ctx.cwd,
    sessionId: ctx.sessionManager.getSessionId(),
    sessionFile: ctx.sessionManager.getSessionFile(),
    leafId: ctx.sessionManager.getLeafId(),
    providerFamily: normalization.providerFamily,
    modelId: normalization.modelId ?? getModelId(ctx.model),
    rawPayloadPath,
    rawPayloadPreview: buildPreview(serialized),
    persisted,
    visibility: visibilityFromNormalization(normalization.status),
    normalizationStatus: normalization.status,
    serializedPayloadChars: serialized.length,
    serializedPayloadTokens: estimateTokens(serialized),
    contextUsageTokens: usage?.tokens ?? undefined,
    contextWindow: usage?.contextWindow,
    caveats: [
      ...normalization.caveats,
      ...(persisted ? [] : (["session-persistence-best-effort"] as const)),
      ...(hadTransform ? (["payload-truncated"] as const) : []),
    ],
  };

  state.captures = dedupeCaptures([...state.captures, manifest]);
  pi.appendEntry(PAYLOAD_CAPTURE_ENTRY_TYPE, manifest);
  return manifest;
}
