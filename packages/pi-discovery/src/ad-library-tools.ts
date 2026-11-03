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
const optionalText = Type.Optional(Type.Union([Type.String(), Type.Null()]));
const imageFields = {
  original_image_url: optionalText,
  resized_image_url: optionalText,
  watermarked_resized_image_url: optionalText,
};
const videoFields = {
  video_hd_url: optionalText,
  video_sd_url: optionalText,
  video_preview_image_url: optionalText,
  watermarked_video_hd_url: optionalText,
  watermarked_video_sd_url: optionalText,
};
const cardFields = {
  ...imageFields,
  ...videoFields,
  headline: optionalText,
  body: optionalText,
  description: optionalText,
  caption: optionalText,
  cta: optionalText,
  cta_type: optionalText,
  landing_url: optionalText,
  landing_domain: optionalText,
};
const outputSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("ok"),
      Type.Literal("not_found"),
      Type.Literal("ambiguous"),
      Type.Literal("error"),
    ]),
    ads: Type.Array(
      Type.Object(
        {
          archive_id: Type.String(),
          page_id: optionalText,
          page_name: optionalText,
          landing_url: optionalText,
          landing_domain: optionalText,
          headline: optionalText,
          body: optionalText,
          images: Type.Optional(
            Type.Array(Type.Object(imageFields), { maxItems: 10 }),
          ),
          videos: Type.Optional(
            Type.Array(Type.Object(videoFields), { maxItems: 10 }),
          ),
          cards: Type.Optional(
            Type.Array(Type.Object(cardFields), { maxItems: 10 }),
          ),
          creative_truncated: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: true },
      ),
    ),
    requestId: Type.Optional(Type.String()),
    partial: Type.Optional(Type.Boolean()),
    truncated: Type.Optional(Type.Boolean()),
    truncation: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: true },
);
type Structured = NonNullable<
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>["structuredContent"]
>;
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
    "Discover advertisers by product keyword in Meta Ad Library. Ads evidence paid media, not budget or an open brief. Returns landing domains/URLs, page IDs, ad copy and supplied media/card metadata. Reuse page_id for known advertisers; surface partial/truncation flags.",
  outputSchema,
  parameters: Type.Object(
    { keyword: Type.String({ minLength: 1, maxLength: 200 }), ...common },
    { additionalProperties: false },
  ),
};
export const adLibraryDomainDefinition = {
  name: "ad_library_domain_ads",
  label: "Meta advertiser ads",
  description:
    "Find a known brand's ads by domain or explicit page_id. Domain resolution can be ambiguous; pass page_id when known. Returns landing domains/URLs, page IDs, ad copy and supplied media/card metadata. Reuse page_id for known advertisers; surface partial/truncation flags.",
  outputSchema,
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
    const text =
      status === "not_found"
        ? "No matching advertiser resolved for this domain in the sampled results. This is not proof of no ads. Use a page_id from keyword results."
        : status === "ambiguous"
          ? "Advertiser resolution is ambiguous. Use a page_id from keyword results; the brand may still have ads."
          : e.message +
            (e.retryAfterMs ? ` Retry after ${e.retryAfterMs / 1000} s.` : "");
    const error = Object.fromEntries(
      Object.entries({
        code: e.code,
        status: e.status,
        serverCode: e.serverCode,
        requestId: e.requestId,
        retryAfterMs: e.retryAfterMs,
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
    outputSchema: typeof outputSchema;
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
