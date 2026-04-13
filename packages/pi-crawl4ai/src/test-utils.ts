/**
 * Test utilities for pi-crawl4ai tests
 */

const originalFetch = global.fetch;

/**
 * Mock fetch for tests. Call this in tests to set up mock responses.
 */
export function mockFetch(
  responses: Array<{ ok?: boolean; status?: number; statusText?: string; data?: any; text?: string }> | { ok?: boolean; status?: number; statusText?: string; data?: any; text?: string }
): jest.Mock {
  const responseQueue = Array.isArray(responses) ? responses : [responses];
  let callIndex = 0;

  const mock = jest.fn(() => {
    const response = responseQueue[callIndex % responseQueue.length];
    callIndex++;

    return Promise.resolve({
      ok: response.ok !== false,
      status: response.status || 200,
      statusText: response.statusText || 'OK',
      json: async () => response.data || response,
      text: async () => response.text || JSON.stringify(response.data || response),
    });
  });

  (global as any).fetch = mock;
  return mock;
}

/**
 * Restore original fetch
 */
export function restoreFetch(): void {
  global.fetch = originalFetch;
}

/**
 * Clean up environment variables before each test
 */
export function resetEnv(): void {
  // Core config
  delete process.env.CRAWL4AI_BASE_URL;
  delete process.env.CRAWL4AI_TIMEOUT;

  // Generic proxy
  delete process.env.CRAWL4AI_PROXY_URL;

  // Oxylabs proxy
  delete process.env.OXYLABS_USER;
  delete process.env.OXYLABS_PASS;
  delete process.env.OXYLABS_HOST;
  delete process.env.OXYLABS_PORT;
  delete process.env.OXYLABS_PORTS;

  // Auth profile test vars
  delete process.env.X_COOKIES_JSON;
  delete process.env.X_USER_AGENT;
  delete process.env.X_BACKOFF_MS;
}
