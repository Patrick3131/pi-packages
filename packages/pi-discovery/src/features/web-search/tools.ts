import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSearxngEnabledByEnv } from "../../config.js";
import { searchSearxng } from "./client.js";
import { searxngToolDefinition } from "./definitions.js";

export function registerSearxng(pi: ExtensionAPI): void {
  pi.registerTool({
    ...searxngToolDefinition,
    defaultActive: isSearxngEnabledByEnv(),
    async execute(_id, params, signal) {
      const result = await searchSearxng(
        {
          query: params.query,
          maxResults: params.max_results,
          engines: params.engines,
          categories: params.categories,
          language: params.language,
          timeRange: params.time_range,
          page: params.page,
        },
        { signal },
      );
      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  });
}
