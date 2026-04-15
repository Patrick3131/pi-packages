/**
 * Tests for crawl request pacing logic
 */

import { applyRequestPacing, resetRequestPacingState } from "./requestPacing";
import type { Crawl4AIConfig, ResolvedAuthSelection } from "../../config";

function createConfig(minRequestIntervalMs?: number): Crawl4AIConfig {
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
      minRequestIntervalMs,
    },
  };
}

function createAuthSelection(name: string, minRequestIntervalMs?: number): ResolvedAuthSelection {
  return {
    profileName: name,
    reason: "explicit-profile",
    profile: {
      minRequestIntervalMs,
    },
  };
}

describe("applyRequestPacing", () => {
  beforeEach(() => {
    resetRequestPacingState();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetRequestPacingState();
  });

  it("should do nothing when no request pacing is configured", async () => {
    const result = await applyRequestPacing(createConfig());
    expect(result).toBeUndefined();
  });

  it("should use the global pacing bucket", async () => {
    const config = createConfig(5000);

    const first = await applyRequestPacing(config);
    const secondPromise = applyRequestPacing(config);

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(4999);

    let settled = false;
    void secondPromise.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const second = await secondPromise;

    expect(first).toEqual({ bucket: "global", minRequestIntervalMs: 5000, waitedMs: 0 });
    expect(second).toEqual({ bucket: "global", minRequestIntervalMs: 5000, waitedMs: 5000 });
  });

  it("should let auth profile pacing override the global value", async () => {
    const config = createConfig(5000);
    const authSelection = createAuthSelection("x-main", 1000);

    const first = await applyRequestPacing(config, authSelection);
    const secondPromise = applyRequestPacing(config, authSelection);

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(999);

    let settled = false;
    void secondPromise.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const second = await secondPromise;

    expect(first).toEqual({ bucket: "auth:x-main", minRequestIntervalMs: 1000, waitedMs: 0 });
    expect(second).toEqual({ bucket: "auth:x-main", minRequestIntervalMs: 1000, waitedMs: 1000 });
  });

  it("should isolate auth buckets from each other", async () => {
    const config = createConfig(5000);
    const xSelection = createAuthSelection("x-main", 1000);
    const redditSelection = createAuthSelection("reddit-main", 1000);

    await applyRequestPacing(config, xSelection);
    const reddit = await applyRequestPacing(config, redditSelection);

    expect(reddit).toEqual({ bucket: "auth:reddit-main", minRequestIntervalMs: 1000, waitedMs: 0 });
  });

  it("should support cancellation while waiting", async () => {
    const config = createConfig(5000);
    const controller = new AbortController();

    await applyRequestPacing(config);
    const pending = applyRequestPacing(config, undefined, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow("Crawl cancelled");
  });
});
