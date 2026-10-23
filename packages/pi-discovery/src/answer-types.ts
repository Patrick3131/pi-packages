export interface WebAnswerParams {
  query: string;
  instructions?: string;
  max_sources?: number;
  timeout_ms?: number;
}
export interface WebAnswerOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface WebAnswerResult {
  id: string;
  query: string;
  answer: string;
  provider: "codex_cli";
  model: string;
  source_type: "search_results";
  sources: Array<{ url: string; title?: string }>;
  searches: Array<{
    action: "search" | "open_page" | "find_in_page";
    queries?: string[];
    url?: string;
    pattern?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    web_search_calls: number;
  };
  gaps: string[];
  timings: { queue_ms: number; agent_ms: number; total_ms: number };
}
export type WebAnswerDetails = Omit<WebAnswerResult, "answer"> & {
  latencyMs: number;
  answerChars: number;
};
