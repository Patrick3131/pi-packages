import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { loadConfig } from '../../config';
import { registerBraveSearchTool, resetBraveSearchRateLimit } from './searchTool';
import { mockFetch } from '../../test-utils';

const createMockPi = () => {
  const registeredTools: any[] = [];

  return {
    registeredTools,
    registerTool: jest.fn((tool) => {
      registeredTools.push(tool);
    }),
  } as unknown as ExtensionAPI & { registeredTools: any[] };
};

describe('registerBraveSearchTool', () => {
  it('registers the brave_search tool', () => {
    const mockPi = createMockPi();
    const config = loadConfig();

    registerBraveSearchTool(mockPi, config);

    expect(mockPi.registerTool).toHaveBeenCalledTimes(1);
    expect(mockPi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'brave_search',
        label: 'Brave Web Search',
      })
    );
  });

  it('provides query alias compatibility', () => {
    const mockPi = createMockPi();
    const config = loadConfig();

    registerBraveSearchTool(mockPi, config);

    const tool = mockPi.registeredTools[0];
    expect(tool.prepareArguments({ q: 'pi coding agent' })).toEqual({
      q: 'pi coding agent',
      query: 'pi coding agent',
    });
  });
});

describe('brave_search execute', () => {
  let mockPi: ExtensionAPI & { registeredTools: any[] };
  let toolExecute: any;

  beforeEach(() => {
    resetBraveSearchRateLimit();
    process.env.BRAVE_SEARCH_API_KEY = 'test-key';
    mockPi = createMockPi();
    const config = loadConfig();
    registerBraveSearchTool(mockPi, config);
    toolExecute = mockPi.registeredTools[0].execute;
  });

  it('throws when no API key is configured', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const secondMockPi = createMockPi();
    registerBraveSearchTool(secondMockPi, loadConfig());
    const execute = secondMockPi.registeredTools[0].execute;

    await expect(execute('tool-call-id', { query: 'test' })).rejects.toThrow(
      'Brave Search is not configured'
    );
  });

  it('calls the Brave Search API with expected headers and query params', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: {
        query: { original: 'pi coding agent' },
        web: { results: [] },
      },
    });

    await toolExecute('tool-call-id', {
      query: 'pi coding agent',
      count: 5,
      country: 'US',
      searchLang: 'en',
      safesearch: 'moderate',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/web/search?');
    expect(url).toContain('q=pi+coding+agent');
    expect(url).toContain('count=5');
    expect(url).toContain('country=US');
    expect(url).toContain('search_lang=en');
    expect(url).toContain('safesearch=moderate');
    expect(options).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'X-Subscription-Token': 'test-key',
        }),
      })
    );
  });

  it('returns normalized web results', async () => {
    mockFetch({
      ok: true,
      data: {
        query: { original: 'pi coding agent' },
        web: {
          results: [
            {
              title: 'Pi Coding Agent',
              url: 'https://example.com/pi',
              description: 'A coding assistant for terminal workflows.',
              language: 'en',
              age: '2 days ago',
            },
          ],
        },
      },
    });

    const result = await toolExecute('tool-call-id', { query: 'pi coding agent' });

    expect(result.content[0].text).toContain('# Brave Search');
    expect(result.content[0].text).toContain('Query: pi coding agent');
    expect(result.content[0].text).toContain('Pi Coding Agent');
    expect(result.details).toEqual({
      query: 'pi coding agent',
      effectiveQuery: 'pi coding agent',
      resultCount: 1,
      results: [
        {
          title: 'Pi Coding Agent',
          url: 'https://example.com/pi',
          description: 'A coding assistant for terminal workflows.',
          language: 'en',
          age: '2 days ago',
          pageAge: undefined,
        },
      ],
      rateLimitWaitedMs: 0,
      retryCount: 0,
      retryWaitedMs: 0,
      minRequestIntervalMs: 1000,
    });
  });

  it('retries 429 responses before surfacing the final API error', async () => {
    const fetchMock = mockFetch([
      {
        ok: false,
        status: 429,
        text: 'rate limit',
      },
      {
        ok: false,
        status: 429,
        text: 'rate limit',
      },
      {
        ok: false,
        status: 429,
        text: 'rate limit',
      },
    ]);

    await expect(toolExecute('tool-call-id', { query: 'pi coding agent' })).rejects.toThrow(
      'Brave Search failed: Brave Search API error (429): rate limit'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries 429 responses and succeeds after backoff', async () => {
    process.env.BRAVE_SEARCH_MIN_INTERVAL_MS = '10';

    const secondMockPi = createMockPi();
    registerBraveSearchTool(secondMockPi, loadConfig());
    const execute = secondMockPi.registeredTools[0].execute;

    const fetchMock = mockFetch([
      {
        ok: false,
        status: 429,
        text: 'rate limit',
      },
      {
        ok: true,
        data: {
          query: { original: 'pi coding agent' },
          web: { results: [] },
        },
      },
    ]);

    const result = await execute('tool-call-id', { query: 'pi coding agent' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.details.retryCount).toBe(1);
    expect(result.details.retryWaitedMs).toBe(10);
    expect(result.details.minRequestIntervalMs).toBe(10);
  });

  it('waits between requests to respect the minimum interval', async () => {
    jest.useFakeTimers();
    process.env.BRAVE_SEARCH_MIN_INTERVAL_MS = '1200';

    const fetchMock = mockFetch({
      ok: true,
      data: {
        query: { original: 'pi coding agent' },
        web: { results: [] },
      },
    });

    const secondMockPi = createMockPi();
    registerBraveSearchTool(secondMockPi, loadConfig());
    const execute = secondMockPi.registeredTools[0].execute;

    try {
      const firstResult = await execute('tool-call-id-1', { query: 'first' });
      expect(firstResult.details.rateLimitWaitedMs).toBe(0);

      const secondPromise = execute('tool-call-id-2', { query: 'second' });

      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1200);
      const secondResult = await secondPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(secondResult.details.rateLimitWaitedMs).toBeGreaterThanOrEqual(1200);
    } finally {
      jest.useRealTimers();
    }
  });

  it('serializes parallel requests so only one starts at a time', async () => {
    jest.useFakeTimers();
    process.env.BRAVE_SEARCH_MIN_INTERVAL_MS = '1200';

    let resolveFirstFetch!: (value: any) => void;
    const firstFetchResponse = new Promise((resolve) => {
      resolveFirstFetch = resolve;
    });

    const fetchMock = jest.fn()
      .mockImplementationOnce(() => firstFetchResponse)
      .mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ query: { original: 'second' }, web: { results: [] } }),
        text: async () => '',
      }));

    (global as any).fetch = fetchMock;

    const secondMockPi = createMockPi();
    registerBraveSearchTool(secondMockPi, loadConfig());
    const execute = secondMockPi.registeredTools[0].execute;

    try {
      const firstPromise = execute('tool-call-id-1', { query: 'first' });
      const secondPromise = execute('tool-call-id-2', { query: 'second' });

      await Promise.resolve();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      resolveFirstFetch({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ query: { original: 'first' }, web: { results: [] } }),
        text: async () => '',
      });
      await firstPromise;

      await Promise.resolve();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1200);
      const secondResult = await secondPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(secondResult.details.effectiveQuery).toBe('second');
      expect(secondResult.details.rateLimitWaitedMs).toBeGreaterThanOrEqual(1200);
    } finally {
      jest.useRealTimers();
    }
  });
});
