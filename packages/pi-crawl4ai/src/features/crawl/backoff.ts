import type { Crawl4AIConfig, ResolvedAuthSelection } from "../../config";

const bucketQueues = new Map<string, Promise<void>>();
const lastRequestAt = new Map<string, number>();

export function resetBackoffState(): void {
  bucketQueues.clear();
  lastRequestAt.clear();
}

export interface BackoffResult {
  bucket: string;
  configuredMs: number;
  waitedMs: number;
}

function getBackoffPolicy(config: Crawl4AIConfig, authSelection?: ResolvedAuthSelection) {
  const profileBackoff = authSelection?.profile.backoffMs;
  const configuredMs = profileBackoff ?? config.raw.backoffMs;
  if (configuredMs === undefined || configuredMs <= 0) return undefined;

  return {
    bucket: profileBackoff !== undefined && authSelection
      ? `auth:${authSelection.profileName}`
      : "global",
    configuredMs,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error("Crawl cancelled"));

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (callback: () => void) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(new Error("Crawl cancelled")));
    const done = () => finish(resolve);

    timer = setTimeout(done, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function applyBackoff(
  config: Crawl4AIConfig,
  authSelection?: ResolvedAuthSelection,
  signal?: AbortSignal
): Promise<BackoffResult | undefined> {
  const policy = getBackoffPolicy(config, authSelection);
  if (!policy) return undefined;

  const prior = bucketQueues.get(policy.bucket) ?? Promise.resolve();
  let release!: () => void;
  const marker = new Promise<void>((resolve) => { release = resolve; });
  bucketQueues.set(policy.bucket, prior.then(() => marker, () => marker));
  await prior.catch(() => undefined);

  try {
    const previous = lastRequestAt.get(policy.bucket);
    const waitedMs = previous === undefined ? 0 : Math.max(0, policy.configuredMs - (Date.now() - previous));
    await sleep(waitedMs, signal);
    lastRequestAt.set(policy.bucket, Date.now());
    return { bucket: policy.bucket, configuredMs: policy.configuredMs, waitedMs };
  } finally {
    release();
    if (bucketQueues.get(policy.bucket) === marker) {
      bucketQueues.delete(policy.bucket);
    }
  }
}
