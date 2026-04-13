/**
 * Tests for crawl backoff logic
 */

import { applyBackoff, resetBackoffState } from "./backoff";
import type { Crawl4AIConfig, ResolvedAuthSelection } from "../../config";

function createConfig(backoffMs?: number): Crawl4AIConfig {
  return {
    baseUrl: "http://localhost:11235",
    timeout: 60000,
    proxyService: {
      isEnabled: () => false,
      getBrowserConfig: () => ({}),
    } as Crawl4AIConfig["proxyService"],
    proxyEnabled: false,
    raw: {
      baseUrl: "http://localhost:11235",
      timeout: 60000,
      enabledByDefault: false,
      backoffMs,
    },
  };
}

function createAuthSelection(name: string, backoffMs?: number): ResolvedAuthSelection {
  return {
    profileName: name,
    reason: "explicit-profile",
    profile: {
      backoffMs,
    },
  };
}

describe("applyBackoff", () => {
  beforeEach(() => {
    resetBackoffState();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetBackoffState();
  });

  it("should do nothing when no backoff is configured", async () => {
    const result = await applyBackoff(createConfig());
    expect(result).toBeUndefined();
  });

  it("should use the global backoff bucket", async () => {
    const config = createConfig(5000);

    const first = await applyBackoff(config);
    const secondPromise = applyBackoff(config);

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(4999);

    let settled = false;
    void secondPromise.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const second = await secondPromise;

    expect(first).toEqual({ bucket: "global", configuredMs: 5000, waitedMs: 0 });
    expect(second).toEqual({ bucket: "global", configuredMs: 5000, waitedMs: 5000 });
  });

  it("should let auth profile backoff override the global value", async () => {
    const config = createConfig(5000);
    const authSelection = createAuthSelection("x-main", 1000);

    const first = await applyBackoff(config, authSelection);
    const secondPromise = applyBackoff(config, authSelection);

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(999);

    let settled = false;
    void secondPromise.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const second = await secondPromise;

    expect(first).toEqual({ bucket: "auth:x-main", configuredMs: 1000, waitedMs: 0 });
    expect(second).toEqual({ bucket: "auth:x-main", configuredMs: 1000, waitedMs: 1000 });
  });

  it("should isolate auth buckets from each other", async () => {
    const config = createConfig(5000);
    const xSelection = createAuthSelection("x-main", 1000);
    const redditSelection = createAuthSelection("reddit-main", 1000);

    await applyBackoff(config, xSelection);
    const reddit = await applyBackoff(config, redditSelection);

    expect(reddit).toEqual({ bucket: "auth:reddit-main", configuredMs: 1000, waitedMs: 0 });
  });

  it("should support cancellation while waiting", async () => {
    const config = createConfig(5000);
    const controller = new AbortController();

    await applyBackoff(config);
    const pending = applyBackoff(config, undefined, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow("Crawl cancelled");
  });
});
