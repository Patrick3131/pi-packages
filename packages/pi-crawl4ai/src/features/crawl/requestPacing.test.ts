/**
 * Tests for crawl request pacing logic
 */

import { applyRequestPacing, resetRequestPacingState } from "./requestPacing";
import type { Crawl4AIConfig } from "../../config";

function createConfig(minRequestIntervalMs?: number): Crawl4AIConfig {
  return {
    baseUrl: "http://localhost:11235",
    timeout: 60000,
    raw: {
      baseUrl: "http://localhost:11235",
      timeout: 60000,
      minRequestIntervalMs,
      retention: {
        enabled: true,
        maxSessions: 20,
        maxAgeDays: 7,
        maxTotalMb: 512,
      },
      outputDir: "./output-crawl4ai",
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

  it("cancels a queued request without waiting for its predecessor", async () => {
    const config = createConfig(5000);
    await applyRequestPacing(config);
    const waiting = applyRequestPacing(config);
    const controller = new AbortController();
    const queued = applyRequestPacing(config, controller.signal);
    controller.abort();
    await expect(queued).rejects.toThrow("Crawl cancelled");
    await jest.advanceTimersByTimeAsync(5000);
    await waiting;
    const next = applyRequestPacing(config);
    await jest.advanceTimersByTimeAsync(5000);
    await expect(next).resolves.toBeDefined();
  });

  it("should support cancellation while waiting", async () => {
    const config = createConfig(5000);
    const controller = new AbortController();

    await applyRequestPacing(config);
    const pending = applyRequestPacing(config, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow("Crawl cancelled");
  });
});
