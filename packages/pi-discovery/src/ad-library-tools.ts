import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isAdLibraryEnabledByEnv } from "./config.js";
import {
  searchAdLibrary,
  AdLibraryClientError,
  formatAdLibrary,
  type AdLibraryParams,
} from "./ad-library.js";
import { adLibraryKeywordDefinition, adLibraryDomainDefinition } from "./ad-library-definitions.js";
export { adLibraryKeywordDefinition, adLibraryDomainDefinition } from "./ad-library-definitions.js";

type Structured = NonNullable<
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>["structuredContent"]
>;
export async function executeAdLibrary(
  params: AdLibraryParams,
  signal?: AbortSignal,
): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>> {
  try {
    const result = formatAdLibrary(await searchAdLibrary(params, { signal }));
    return {
      content: [{ type: "text" as const, text: result.text }],
      details: result.details,
      structuredContent: {
        ...result.details,
        status: "ok",
      } as unknown as Structured,
    };
  } catch (e) {
    if (!(e instanceof AdLibraryClientError)) throw e;
    const status =
      e.serverCode === "ad_library_page_not_found"
        ? "not_found"
        : e.serverCode === "ad_library_page_ambiguous"
          ? "ambiguous"
          : "error";
    const candidateText = e.candidates?.length
      ? `\nCandidates: ${e.candidates.map((c) => `${c.page_name ?? "unknown"} page_id=${c.page_id} votes=${c.votes}/${c.ads} ads`).join("; ")}` +
        (e.retryWith ? `\nRetry with page_id=${e.retryWith.page_id}.` : "")
      : "";
    const text =
      (status === "not_found"
        ? "No matching advertiser resolved for this domain in the sampled results. This is not proof of no ads. Use a page_id from keyword results."
        : status === "ambiguous"
          ? "Advertiser resolution is ambiguous. Use a page_id from keyword results; the brand may still have ads."
          : e.reason === "cursor_mismatch"
            ? "Cursor does not match this selector/filters. Restart without cursor."
            : e.message +
              (e.reason ? ` Reason: ${e.reason}.` : "") +
              (e.retryAfterMs ? ` Retry after ${e.retryAfterMs / 1000} s.` : "")) +
      candidateText;
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
      }).filter(([, value]) => value !== undefined),
    );
    const details = { status, ads: [], error };
    return {
      isError: status === "error",
      content: [{ type: "text" as const, text }],
      details,
      structuredContent: details as unknown as Structured,
    };
  }
}
export function registerAdLibrary(pi: ExtensionAPI): void {
  const register = <T extends import("typebox").TSchema>(definition: {
    name: string;
    label: string;
    description: string;
    parameters: T;
    outputSchema: typeof adLibraryKeywordDefinition.outputSchema;
  }) =>
    pi.registerTool({
      ...definition,
      defaultActive: isAdLibraryEnabledByEnv(),
      execute: async (_id, params, signal) =>
        executeAdLibrary(params as AdLibraryParams, signal),
      renderResult(result, { expanded }) {
        const text = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        return new Text(expanded ? text : text.split("\n")[0], 0, 0);
      },
    });
  register(adLibraryKeywordDefinition);
  register(adLibraryDomainDefinition);
}
