import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isAdLibraryEnabledByEnv } from "./config.js";
import {
  searchAdLibrary,
  AdLibraryClientError,
  formatAdLibrary,
  type AdLibraryParams,
} from "./ad-library.js";
const common = {
  country: Type.Optional(Type.String({ pattern: "^[a-zA-Z]{2}$" })),
  active_only: Type.Optional(Type.Boolean()),
  max_ads: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 5000, maximum: 180000 })),
};
export const adLibraryKeywordDefinition = {
  name: "ad_library_keyword_ads",
  label: "Meta keyword ads",
  description:
    "Discover advertisers by product keyword in Meta Ad Library. Ads evidence paid media, not budget or an open brief. Surface partial and truncated results.",
  parameters: Type.Object(
    { keyword: Type.String({ minLength: 1, maxLength: 200 }), ...common },
    { additionalProperties: false },
  ),
};
export const adLibraryDomainDefinition = {
  name: "ad_library_domain_ads",
  label: "Meta advertiser ads",
  description:
    "Find a known brand's ads by domain or explicit page_id. Domain resolution can be ambiguous; pass page_id when known. Surface partial and truncated results.",
  parameters: Type.Union([
    Type.Object(
      { domain: Type.String({ minLength: 3, maxLength: 253 }), ...common },
      { additionalProperties: false },
    ),
    Type.Object(
      { page_id: Type.String({ pattern: "^[0-9]{1,32}$" }), ...common },
      { additionalProperties: false },
    ),
  ]),
};
export async function executeAdLibrary(
  params: AdLibraryParams,
  signal?: AbortSignal,
): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>> {
  try {
    const result = formatAdLibrary(await searchAdLibrary(params, { signal }));
    return {
      content: [{ type: "text" as const, text: result.text }],
      details: result.details,
    };
  } catch (e) {
    if (!(e instanceof AdLibraryClientError)) throw e;
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text:
            e.message +
            (e.retryAfterMs ? ` Retry after ${e.retryAfterMs / 1000} s.` : ""),
        },
      ],
      details: {
        error: {
          code: e.code,
          status: e.status,
          serverCode: e.serverCode,
          requestId: e.requestId,
          retryAfterMs: e.retryAfterMs,
        },
      },
    };
  }
}
export function registerAdLibrary(pi: ExtensionAPI): void {
  const register = <T extends import("typebox").TSchema>(definition: {
    name: string;
    label: string;
    description: string;
    parameters: T;
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
