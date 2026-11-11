import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isAmazonEnabledByEnv } from "./config.js";
import { AmazonClientError } from "./amazon-errors.js";
import { formatAmazonListing, formatAmazonProduct } from "./amazon-format.js";
import {
  AMAZON_NOT_FOUND_CODES,
  type AmazonNewReleasesParams,
  type AmazonProductParams,
  type AmazonResultEnvelope,
  type AmazonSearchParams,
} from "./amazon-types.js";
import { getAmazonProduct, newAmazonReleases, searchAmazon } from "./amazon.js";
import {
  amazonNewReleasesDefinition,
  amazonProductDefinition,
  amazonSearchDefinition,
} from "./amazon-definitions.js";

type Structured = NonNullable<
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>["structuredContent"]
>;
type ToolResult =
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>;

export {
  amazonNewReleasesDefinition,
  amazonProductDefinition,
  amazonSearchDefinition,
} from "./amazon-definitions.js";

/** Guidance copy: not-found and disabled are outcomes, never retry signals. */
function failureText(
  error: AmazonClientError,
  status: "not_found" | "error",
  kind: "listing" | "product",
): string {
  if (status === "not_found")
    return kind === "product"
      ? "No public Amazon product page was found for this ASIN: it may be delisted or region-blocked. This is not a retry signal."
      : "No public Amazon listing page was found for this selector. This is not a retry signal.";
  switch (error.code) {
    case "disabled":
      return "Amazon acquisition is disabled by the server gate (AMAZON_ENABLED). Ask the operator to enable it; this client does not retry.";
    case "invalid_request":
      return error.serverCode
        ? "The Amazon service rejected the request (amazon_invalid_request); check the selector, page and timeout bounds."
        : "The Amazon request was rejected before dispatch: invalid parameters or Discovery configuration.";
    case "queue_full":
      return "Amazon acquisition capacity is full; this client does not retry.";
    case "blocked":
      return `Amazon acquisition was blocked by the provider or proxy (${error.serverCode ?? "blocked"}). A later identical call may still succeed; this client never retries on its own.`;
    case "upstream":
      return error.reason
        ? `The Amazon upstream failed (${error.reason}); the page may have changed layout or returned an unusable body.`
        : "The Amazon upstream failed.";
    case "timeout":
      return "Amazon acquisition exceeded the server deadline.";
    case "transport":
      return "The Amazon endpoint could not be reached.";
    case "malformed":
      return "The Amazon endpoint returned a malformed success response.";
    default:
      return `Amazon request failed (${error.code}).`;
  }
}

function failureResult(
  error: AmazonClientError,
  kind: "listing" | "product",
): ToolResult {
  const status = AMAZON_NOT_FOUND_CODES.has(error.serverCode ?? "")
    ? "not_found"
    : "error";
  const usageText = error.usage
    ? [
        error.usage.wire_estimated
          ? `~${error.usage.wire_bytes} wire bytes (gzip estimate)`
          : `${error.usage.wire_bytes} wire bytes`,
        `${error.usage.decoded_bytes} decoded bytes`,
        `${error.usage.requests} request${error.usage.requests === 1 ? "" : "s"}`,
        error.usage.wire_incomplete ? "(incomplete)" : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const suffix = [
    error.serverCode ? `Server code: ${error.serverCode}.` : "",
    error.reason ? `Reason: ${error.reason}.` : "",
    error.retryAfterMs
      ? `Advisory retry after ${Math.ceil(error.retryAfterMs / 1000)} s; this client does not retry or wait.`
      : "",
    error.requestId ? `Request ID: ${error.requestId}.` : "",
    usageText ? `Usage for this call: ${usageText}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = failureText(error, status, kind);
  const details: AmazonResultEnvelope<never> = {
    status,
    error: {
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.serverCode === undefined
        ? {}
        : { serverCode: error.serverCode }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
      ...(error.reason === undefined ? {} : { reason: error.reason }),
      ...(error.usage === undefined ? {} : { usage: error.usage }),
    },
  };
  return {
    isError: status === "error",
    content: [
      { type: "text" as const, text: [text, suffix].filter(Boolean).join(" ") },
    ],
    details,
    structuredContent: details as unknown as Structured,
  };
}

function successResult(formatted: {
  text: string;
  details: object;
}): ToolResult {
  return {
    isError: false,
    content: [{ type: "text" as const, text: formatted.text }],
    details: formatted.details,
    structuredContent: formatted.details as unknown as Structured,
  };
}

/** One New Releases page; sweep diffs stay with the caller. */
export async function executeAmazonNewReleases(
  params: AmazonNewReleasesParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatAmazonListing(await newAmazonReleases(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof AmazonClientError)) throw error;
    return failureResult(error, "listing");
  }
}

/** One search page; sort is supplied to the formatter for honest copy. */
export async function executeAmazonSearch(
  params: AmazonSearchParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatAmazonListing(await searchAmazon(params, { signal }), {
        sort: params.sort ?? "newest",
      }),
    );
  } catch (error) {
    if (!(error instanceof AmazonClientError)) throw error;
    return failureResult(error, "listing");
  }
}

/** One product detail page; variations are never fetched here. */
export async function executeAmazonProduct(
  params: AmazonProductParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatAmazonProduct(await getAmazonProduct(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof AmazonClientError)) throw error;
    return failureResult(error, "product");
  }
}

export function registerAmazon(pi: ExtensionAPI): void {
  const defaultActive = isAmazonEnabledByEnv();
  pi.registerTool({
    ...amazonNewReleasesDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeAmazonNewReleases(
        params as unknown as AmazonNewReleasesParams,
        signal,
      ),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...amazonSearchDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeAmazonSearch(params as unknown as AmazonSearchParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...amazonProductDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeAmazonProduct(params as unknown as AmazonProductParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
}
