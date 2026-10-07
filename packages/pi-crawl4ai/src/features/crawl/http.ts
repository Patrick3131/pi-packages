import type { Crawl4AIConfig } from "../../config";

export const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** One operation deadline, including queueing, body consumption and extraction. */
export function createCrawlDeadline(timeout: number, caller?: AbortSignal): { signal: AbortSignal; deadline: number; dispose(): void } {
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("timeout must be positive and finite");
  const controller = new AbortController();
  const deadline = Date.now() + timeout;
  const abort = () => controller.abort(new Error("Crawl cancelled"));
  if (caller?.aborted) abort();
  else caller?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Crawl deadline exceeded")), timeout);
  return {
    signal: controller.signal,
    deadline,
    dispose() { clearTimeout(timer); caller?.removeEventListener("abort", abort); },
  };
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Crawl cancelled"));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason ?? new Error("Crawl cancelled")); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export function redactError(message: string, config: Crawl4AIConfig): string {
  const token = config.apiToken ?? config.raw.apiToken;
  return (token ? message.split(token).join("[redacted]") : message)
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").slice(0, 2000);
}

function transportMessage(value: unknown): string {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return String(value);
}

/** Only the immediate cause; no stacks, recursive cause traversal or raw objects. */
function formatTransportError(error: unknown, config: Crawl4AIConfig): string {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined;
  const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  // Keep endpoint/code before potentially long messages. Remove userinfo everywhere,
  // then redact tokens before the shared bound can leave a partial secret behind.
  const message = `crawl4ai connection failed (${config.baseUrl})${code ? ` [${code}]` : ""}: ${transportMessage(error)}${cause !== undefined ? `; cause: ${transportMessage(cause)}` : ""}`;
  return redactError(message.replace(/(https?:\/\/)[^\s/"'<>]*@/gi, "$1"), config);
}

export async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  const declared = Number(response.headers?.get("content-length"));
  if (declared > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("crawl4ai response exceeds 20 MiB");
  }
  // Lightweight test transports may implement text() but not a ReadableStream.
  if (!response.body) {
    const text = await abortable(response.text(), signal);
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("crawl4ai response exceeds 20 MiB");
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("crawl4ai response exceeds 20 MiB");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchCrawlApi(config: Crawl4AIConfig, route: string, init: RequestInit, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw signal.reason;
  const token = config.apiToken ?? config.raw.apiToken;
  let response: Response;
  try {
    response = await abortable(fetch(`${config.baseUrl.replace(/\/+$/, "")}${route}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
      signal,
    }), signal);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new Error(formatTransportError(error, config));
  }
  const text = await readBoundedBody(response, signal);
  if (!response.ok) {
    const unsupported = /deep_crawl_strategy|untrusted request|BFSDeepCrawlStrategy|DFSDeepCrawlStrategy|BestFirstCrawlingStrategy/i.test(text)
      ? " This server rejects deep-crawl configuration; use a single-page crawl or a deployment that supports trusted deep strategies. Do not bypass server security." : "";
    throw new Error(`crawl4ai API error (${response.status}): ${redactError(text, config).slice(0, 1000)}${unsupported}`);
  }
  return text;
}
