import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isSearxngEnabledByEnv, isWebAnswerEnabledByEnv } from "./config.js";
import { searchSearxng } from "./search.js";
import { askWeb, formatWebAnswer, WebAnswerClientError } from "./answer.js";
import {
  searxngToolDefinition,
  webAnswerToolDefinition,
} from "./toolDefinition.js";

export default function discovery(pi: ExtensionAPI): void {
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
  pi.registerTool({
    ...webAnswerToolDefinition,
    defaultActive: isWebAnswerEnabledByEnv(),
    executionMode: "sequential",
    async execute(
      _id,
      params,
      signal,
    ): Promise<
      import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>
    > {
      const started = Date.now();
      try {
        const result = formatWebAnswer(
          await askWeb(params, { signal }),
          Date.now() - started,
        );
        return {
          content: [{ type: "text", text: result.text }],
          details: result.details,
        };
      } catch (error) {
        if (!(error instanceof WebAnswerClientError)) throw error;
        const wait =
          error.retryAfterMs === undefined
            ? ""
            : ` Retry after ${Math.ceil(error.retryAfterMs / 1000)} s.`;
        return {
          isError: true,
          content: [{ type: "text", text: error.message + wait }],
          details: {
            error: {
              code: error.code,
              status: error.status,
              serverCode: error.serverCode,
              requestId: error.requestId,
              retryAfterMs: error.retryAfterMs,
            },
          },
        };
      }
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("web_answer ")) +
          String(args.query ?? "…"),
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme) {
      if (result.isError)
        return new Text(
          theme.fg(
            "error",
            result.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n"),
          ),
          0,
          0,
        );
      const d = result.details as {
        sources?: Array<{ url: string; title?: string }>;
        gaps?: string[];
        model?: string;
      };
      const lines = [
        `Web answer · ${d.model ?? "unknown model"} · ${d.sources?.length ?? 0} search results`,
      ];
      if (expanded)
        for (const source of d.sources ?? [])
          lines.push(`${source.title ?? source.url} — ${source.url}`);
      if (d.gaps?.length) lines.push("Gaps: " + d.gaps.join(", "));
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
