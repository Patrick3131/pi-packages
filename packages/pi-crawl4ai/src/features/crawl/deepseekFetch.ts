import { abortable, CrawlOperationError, readBoundedBody } from "./http";
import type { Crawl4AIResponse } from "./types";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export async function fetchDeepSeekPage(url: string, apiKey: string, signal: AbortSignal): Promise<Crawl4AIResponse> {
  if (signal.aborted) throw signal.reason;
  let response: Response;
  try {
    response = await abortable(fetch(`${DEEPSEEK_BASE_URL}/v1/tools/fetch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      redirect: "error",
      signal,
    }), signal);
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new CrawlOperationError("transport_failure", "Could not connect to DeepSeek Fetch");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    const message = response.status === 404 ? "could not retrieve usable page content"
      : response.status === 403 ? "URL rejected by provider security policy" : "request failed";
    throw new CrawlOperationError(response.status === 504 ? "timeout" : "provider_failure",
      `DeepSeek Fetch ${message} (HTTP ${response.status})`, response.status);
  }
  let page: { title?: unknown; content?: unknown } | null;
  try {
    page = JSON.parse(await readBoundedBody(response, signal));
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new CrawlOperationError("provider_failure", "Invalid or oversized DeepSeek Fetch response");
  }
  if (typeof page?.title !== "string" || typeof page?.content !== "string" || !page.content.trim()) {
    throw new CrawlOperationError("provider_failure", "DeepSeek Fetch returned no usable Markdown");
  }
  return { success: true, results: [{ url, success: true, metadata: { title: page.title }, markdown: page.content }] };
}
