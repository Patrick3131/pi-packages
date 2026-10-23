import { WebAnswerClientError } from "./answer-errors.js";
import type { WebAnswerParams, WebAnswerResult } from "./answer-types.js";
export const record = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const integer = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
export function requestBody(
  params: WebAnswerParams,
): Required<Omit<WebAnswerParams, "instructions">> & { instructions?: string } {
  if (
    !record(params) ||
    Object.keys(params).some(
      (k) =>
        !["query", "instructions", "max_sources", "timeout_ms"].includes(k),
    )
  )
    throw new WebAnswerClientError("invalid_request");
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const instructions =
    params.instructions === undefined
      ? undefined
      : typeof params.instructions === "string"
        ? params.instructions.trim()
        : null;
  const max_sources = params.max_sources === undefined ? 5 : params.max_sources,
    timeout_ms = params.timeout_ms === undefined ? 60000 : params.timeout_ms;
  if (
    !query ||
    [...query].length > 8000 ||
    instructions === null ||
    (instructions !== undefined && [...instructions].length > 4000) ||
    !integer(max_sources) ||
    max_sources < 1 ||
    max_sources > 20 ||
    !integer(timeout_ms) ||
    timeout_ms < 5000 ||
    timeout_ms > 120000
  )
    throw new WebAnswerClientError("invalid_request");
  return {
    query,
    ...(instructions === undefined ? {} : { instructions }),
    max_sources,
    timeout_ms,
  };
}
function malformed(): never {
  throw new WebAnswerClientError("malformed");
}
export function parseAnswer(value: unknown, cap: number): WebAnswerResult {
  if (!record(value)) return malformed();
  for (const key of ["id", "query", "answer", "model"])
    if (typeof value[key] !== "string" || !value[key]) return malformed();
  if (
    value.provider !== "codex_cli" ||
    value.source_type !== "search_results" ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.searches) ||
    !Array.isArray(value.gaps) ||
    value.gaps.some((x) => typeof x !== "string") ||
    !record(value.timings)
  )
    return malformed();
  for (const key of ["queue_ms", "agent_ms", "total_ms"])
    if (!integer(value.timings[key])) return malformed();
  const sources: WebAnswerResult["sources"] = [],
    seen = new Set<string>();
  for (const source of value.sources) {
    if (
      !record(source) ||
      typeof source.url !== "string" ||
      (source.title !== undefined && typeof source.title !== "string")
    )
      return malformed();
    const url = source.url.trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(parsed.protocol) || seen.has(url))
      continue;
    seen.add(url);
    if (sources.length < cap)
      sources.push({
        url,
        ...(source.title?.trim() ? { title: source.title.trim() } : {}),
      });
  }
  const searches: WebAnswerResult["searches"] = [];
  for (const search of value.searches) {
    if (
      !record(search) ||
      !["search", "open_page", "find_in_page"].includes(String(search.action))
    )
      return malformed();
    if (
      search.queries !== undefined &&
      (!Array.isArray(search.queries) ||
        search.queries.some((x) => typeof x !== "string"))
    )
      return malformed();
    for (const key of ["url", "pattern"])
      if (search[key] !== undefined && typeof search[key] !== "string")
        return malformed();
    searches.push({
      action: search.action as WebAnswerResult["searches"][number]["action"],
      ...(search.queries === undefined
        ? {}
        : { queries: search.queries as string[] }),
      ...(search.url === undefined ? {} : { url: search.url as string }),
      ...(search.pattern === undefined
        ? {}
        : { pattern: search.pattern as string }),
    });
  }
  let usage: WebAnswerResult["usage"];
  if (value.usage !== undefined) {
    if (!record(value.usage) || !integer(value.usage.web_search_calls))
      return malformed();
    for (const key of ["input_tokens", "output_tokens"])
      if (value.usage[key] !== undefined && !integer(value.usage[key]))
        return malformed();
    usage = {
      web_search_calls: value.usage.web_search_calls,
      ...(value.usage.input_tokens === undefined
        ? {}
        : { input_tokens: value.usage.input_tokens as number }),
      ...(value.usage.output_tokens === undefined
        ? {}
        : { output_tokens: value.usage.output_tokens as number }),
    };
  }
  return {
    id: value.id as string,
    query: value.query as string,
    answer: value.answer as string,
    provider: "codex_cli",
    model: value.model as string,
    source_type: "search_results",
    sources,
    searches,
    gaps: value.gaps as string[],
    timings: value.timings as WebAnswerResult["timings"],
    ...(usage ? { usage } : {}),
  };
}
