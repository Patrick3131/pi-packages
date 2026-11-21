import { formatAttempts } from "./transport.js";
import type {
  AgentToolResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isAdLibraryEnabledByEnv } from "../../config.js";
import {
  searchAdLibrary,
  formatAdLibrary,
  AdLibraryClientError,
} from "./client.js";
import {
  getLinkedInAdDetail,
  searchLinkedInAds,
  formatLinkedInAds,
} from "./linkedin.js";
import {
  adLibraryDefinition,
  inputCorrection,
  type AdLibraryToolParams,
} from "./unified.js";

type Structured = NonNullable<AgentToolResult<unknown>["structuredContent"]>;

export async function executeAdLibrary(
  params: AdLibraryToolParams,
  signal?: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  signal?.throwIfAborted();
  const { platform, ...selectors } = params;
  const correction = inputCorrection(params);
  if (correction) {
    const details = {
      platform,
      status: "error",
      error: { code: "invalid_request", message: correction },
    };
    return {
      isError: true,
      content: [{ type: "text", text: correction }],
      details,
      structuredContent: details,
    };
  }
  try {
    if (params.ad_id !== undefined) {
      const response = await getLinkedInAdDetail(
        {
          ad_id: params.ad_id,
          ...(params.timeout_ms === undefined
            ? {}
            : { timeout_ms: params.timeout_ms }),
        },
        { signal },
      );
      const details = { platform, status: "ok", response };
      const { ad } = response;
      const text = [
        `LinkedIn ad ${ad.ad_id}`,
        ad.advertiser.name && `Advertiser: ${ad.advertiser.name}`,
        ad.author?.name && `Author: ${ad.author.name}`,
        ad.transparency?.payer && `Payer: ${ad.transparency.payer}`,
        ad.headline,
        ad.commentary,
        ad.cta,
        ...(ad.transparency?.targeting?.disclosures ?? []).map(
          (d) => d.label + ": " + d.text,
        ),
        ad.detail_url,
        `Request: ${response.id}`,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        content: [{ type: "text", text }],
        details,
        structuredContent: details as unknown as Structured,
      };
    }
    const body = {
      ...selectors,
      max_ads: params.max_ads ?? (platform === "meta" ? 10 : 24),
    };
    const formatted =
      platform === "meta"
        ? formatAdLibrary(await searchAdLibrary(body, { signal }), false)
        : formatLinkedInAds(
            await searchLinkedInAds(body, { signal }),
            false,
            body,
          );
    const response = formatted.details;
    const next =
      !response.complete && response.next_cursor && !params.domain
        ? { platform, ...body, cursor: response.next_cursor }
        : undefined;
    const details = {
      platform,
      status: response.partial ? "partial" : "ok",
      response,
      ...(next ? { next_request: next } : {}),
    };
    let text = formatted.text;
    if (next) text += "\nNext request: " + JSON.stringify(next);
    else if (response.complete === false)
      text += params.domain
        ? "\nFor more ads, start a new search using the resolved page_id."
        : "\nIncomplete sample. No continuation token is available.";
    return {
      content: [{ type: "text", text }],
      details,
      structuredContent: details as unknown as Structured,
    };
  } catch (e) {
    if (!(e instanceof AdLibraryClientError)) throw e;
    const status =
      e.serverCode === "ad_library_page_not_found" ||
      e.serverCode === "ad_library_ad_not_found"
        ? "not_found"
        : e.serverCode === "ad_library_page_ambiguous"
          ? "ambiguous"
          : "error";
    const candidateText = e.candidates?.length
      ? `\nCandidates: ${e.candidates.map((c) => `${c.page_name ?? "unknown"} page_id=${c.page_id} votes=${c.votes}/${c.ads} ads`).join("; ")}` +
        (e.retryWith ? `\nRetry with page_id=${e.retryWith.page_id}.` : "")
      : "";
    let text =
      (status === "not_found"
        ? "No matching advertiser resolved in the sampled results. Use a page_id from keyword results."
        : status === "ambiguous"
          ? "Advertiser resolution is ambiguous. Use a page_id from keyword results; the brand may still have ads."
          : e.reason === "cursor_mismatch"
            ? "Cursor does not match this selector/filters. Restart without cursor."
            : e.message +
              (e.reason ? ` Reason: ${e.reason}.` : "") +
              (e.retryAfterMs
                ? ` Retry after ${e.retryAfterMs / 1000} s.`
                : "")) + candidateText;
    if (platform === "linkedin") {
      if (e.serverCode === "ad_library_ad_not_found")
        text = "LinkedIn returned ad not found.";
      else if (status === "not_found")
        text =
          "Company page could not be resolved. Verify its slug or use account_owner for name discovery.";
      if (e.serverCode === "ad_library_blocked")
        text +=
          e.upstreamStatusCounts?.["403"] === e.attempts && e.attempts
            ? " LinkedIn denied access. Ad activity is unknown."
            : " Ad activity is unknown.";
      text += formatAttempts(e.attempts, e.upstreamStatusCounts);
      if (e.resolvedPageId) text += ` Advertiser page ID: ${e.resolvedPageId}.`;
      if (e.stage) text += ` Stage: ${e.stage}.`;
      if (e.requestId) text += ` Request: ${e.requestId}.`;
    }
    const error = Object.fromEntries(
      Object.entries({
        code: e.code,
        status: e.status,
        serverCode: e.serverCode,
        requestId: e.requestId,
        retryAfterMs: e.retryAfterMs,
        candidates: e.candidates,
        retry_with: e.retryWith,
        reason: e.reason,
        attempts: e.attempts,
        upstream_status_counts: e.upstreamStatusCounts,
        stage: e.stage,
        resolved_page_id: e.resolvedPageId,
      }).filter(([, value]) => value !== undefined),
    );
    const retry = platform === "linkedin" && params.cursor && e.retrySameCursor;
    const details = {
      platform,
      status,
      error,
      ...(retry ? { next_request: { ...params } } : {}),
    };
    if (retry)
      text +=
        "\nNo page was returned. You can retry this request with the same cursor.";
    return {
      isError: status === "error",
      content: [{ type: "text" as const, text }],
      details,
      structuredContent: details as unknown as Structured,
    };
  }
}
export function registerAdLibrary(pi: ExtensionAPI): void {
  pi.registerTool({
    ...adLibraryDefinition,
    defaultActive: isAdLibraryEnabledByEnv(),
    execute: (_id, params, signal) => executeAdLibrary(params, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
}
