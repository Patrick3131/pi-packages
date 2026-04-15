const originalFetch = global.fetch;

export function mockFetch(
  responses:
    | Array<{ ok?: boolean; status?: number; statusText?: string; data?: any; text?: string }>
    | { ok?: boolean; status?: number; statusText?: string; data?: any; text?: string }
): jest.Mock {
  const queue = Array.isArray(responses) ? responses : [responses];
  let callIndex = 0;

  const mock = jest.fn(() => {
    const response = queue[callIndex % queue.length];
    callIndex++;

    return Promise.resolve({
      ok: response.ok !== false,
      status: response.status || 200,
      statusText: response.statusText || "OK",
      json: async () => response.data || response,
      text: async () => response.text || JSON.stringify(response.data || response),
    });
  });

  (global as any).fetch = mock;
  return mock;
}

export function restoreFetch(): void {
  global.fetch = originalFetch;
}

export function resetEnv(): void {
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_BASE_URL;
  delete process.env.BRAVE_SEARCH_TIMEOUT;
  delete process.env.BRAVE_SEARCH_ENABLED_BY_DEFAULT;
  delete process.env.BRAVE_SEARCH_MIN_INTERVAL_MS;
}
