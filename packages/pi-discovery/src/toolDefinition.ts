import { Type } from "typebox";
import { DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT, TOOL_NAME } from "./types.js";

export const searxngToolDefinition = {
  name: TOOL_NAME,
  label: "SearXNG search",
  description: "Search the web with SearXNG.",
  promptSnippet: "web_search_searxng(query): search the web with SearXNG",
  promptGuidelines: ["Use only when the user requests a live web search."],
  parameters: Type.Object({
    query: Type.String({ description: "The search query to execute." }),
    max_results: Type.Optional(
      Type.Number({
        description: `Maximum results to return. Default: ${DEFAULT_MAX_RESULTS}.`,
        default: DEFAULT_MAX_RESULTS,
        minimum: 1,
        maximum: MAX_RESULTS_LIMIT,
      }),
    ),
    engines: Type.Optional(
      Type.String({
        description:
          "Comma-separated SearXNG engines. Default: brave,duckduckgo.",
      }),
    ),
    categories: Type.Optional(
      Type.String({ description: "Comma-separated SearXNG categories." }),
    ),
    language: Type.Optional(
      Type.String({ description: "Search language code, for example en." }),
    ),
    time_range: Type.Optional(
      Type.Union(
        [Type.Literal("day"), Type.Literal("month"), Type.Literal("year")],
        {
          description:
            "Restrict results to a time range when the engines support it.",
        },
      ),
    ),
    page: Type.Optional(
      Type.Number({
        description: "Result page number. Default: 1.",
        default: 1,
        minimum: 1,
      }),
    ),
  }),
};

export const webAnswerToolDefinition = {
  name: "web_answer",
  label: "Web answer",
  description:
    "Web research answer with search results; usually takes seconds and consumes shared account quota.",
  promptSnippet:
    "web_answer(query): synthesize a web research answer with search evidence",
  promptGuidelines: [
    "Use web_search_searxng to enumerate URLs and web_answer for research synthesis.",
    "Search results are evidence candidates, not annotated citations. Assess relevance; use crawl to verify pages before citing unsupported claims.",
    "The retrieved list is capped and does not establish which links support the answer. Preserve inline links; assess their claims and pay attention to gaps.",
    "Avoid parallel bursts: each answer consumes shared account quota.",
  ],
  parameters: Type.Object(
    {
      query: Type.String({ minLength: 1, maxLength: 8000 }),
      instructions: Type.Optional(Type.String({ maxLength: 4000 })),
      max_sources: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 20, default: 5 }),
      ),
      timeout_ms: Type.Optional(
        Type.Integer({ minimum: 5000, maximum: 300000, default: 180000 }),
      ),
    },
    { additionalProperties: false },
  ),
};
