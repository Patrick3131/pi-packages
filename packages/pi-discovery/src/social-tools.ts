import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isSocialEnabledByEnv } from "./config.js";
import { SocialClientError } from "./social-errors.js";
import { formatSocialPost, formatSocialProfile, formatSocialProfilePosts } from "./social-format.js";
import {
  SOCIAL_POST_NOT_FOUND,
  SOCIAL_PROFILE_NOT_FOUND,
  type SocialPostParams,
  type SocialProfileParams,
  type SocialProfilePostsParams,
  type SocialResultEnvelope,
} from "./social-types.js";
import { getSocialPost, getSocialProfile, getSocialProfilePosts } from "./social.js";

type Structured = NonNullable<
  import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>["structuredContent"]
>;
type ToolResult = import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>;

import { socialProfileDefinition, socialProfilePostsDefinition, socialPostDefinition } from "./social-definitions.js";
export { socialProfileDefinition, socialProfilePostsDefinition, socialPostDefinition } from "./social-definitions.js";

function failureResult(
  error: SocialClientError,
  notFoundCode: string,
  noun: string,
): ToolResult {
  const status = error.serverCode === notFoundCode ? "not_found" : "error";
  const text =
    status === "not_found"
      ? `No public ${noun} found (${error.serverCode}). This is not evidence that the account is private or that the record is absent on every platform.`
      : [
          error.message,
          error.serverCode ? `Server code: ${error.serverCode}.` : "",
          error.reason ? `Reason: ${error.reason}.` : "",
          error.retryAfterMs
            ? `Advisory retry after ${Math.ceil(error.retryAfterMs / 1000)} s; this client does not retry or wait.`
            : "",
        ]
          .filter(Boolean)
          .join(" ");
  const details: SocialResultEnvelope<never> = {
    status,
    error: {
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.serverCode === undefined ? {} : { serverCode: error.serverCode }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
      ...(error.reason === undefined ? {} : { reason: error.reason }),
    },
  };
  return {
    isError: true,
    content: [{ type: "text" as const, text }],
    details,
    structuredContent: details as unknown as Structured,
  };
}

function successResult(
  formatted: { text: string; details: object },
): ToolResult {
  return {
    isError: false,
    content: [{ type: "text" as const, text: formatted.text }],
    details: formatted.details,
    structuredContent: formatted.details as unknown as Structured,
  };
}

/** One profile query. */
export async function executeSocialProfile(
  params: SocialProfileParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(formatSocialProfile(await getSocialProfile(params, { signal })));
  } catch (error) {
    if (!(error instanceof SocialClientError)) throw error;
    return failureResult(error, SOCIAL_PROFILE_NOT_FOUND, "profile");
  }
}

/** Profile plus a bounded hydrated sample. */
export async function executeSocialProfilePosts(
  params: SocialProfilePostsParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(
      formatSocialProfilePosts(await getSocialProfilePosts(params, { signal })),
    );
  } catch (error) {
    if (!(error instanceof SocialClientError)) throw error;
    return failureResult(error, SOCIAL_PROFILE_NOT_FOUND, "profile");
  }
}

/** One exact post query. */
export async function executeSocialPost(
  params: SocialPostParams,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return successResult(formatSocialPost(await getSocialPost(params, { signal })));
  } catch (error) {
    if (!(error instanceof SocialClientError)) throw error;
    return failureResult(error, SOCIAL_POST_NOT_FOUND, "post");
  }
}

export function registerSocial(pi: ExtensionAPI): void {
  const defaultActive = isSocialEnabledByEnv();
  pi.registerTool({
    ...socialProfileDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeSocialProfile(params as unknown as SocialProfileParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...socialProfilePostsDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeSocialProfilePosts(params as unknown as SocialProfilePostsParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
  pi.registerTool({
    ...socialPostDefinition,
    defaultActive,
    execute: async (_id, params, signal) =>
      executeSocialPost(params as unknown as SocialPostParams, signal),
    renderResult(result, { expanded }) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(expanded ? text : text.split("\n")[0], 0, 0);
    },
  });
}
