/**
 * Tests for crawl tool
 */

import { loadConfig } from '../../config';
import { registerCrawlTool } from './crawlTool';
import { mockFetch } from '../../test-utils';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

// Mock ExtensionAPI
const createMockPi = () => {
  const registeredTools: any[] = [];

  return {
    registeredTools,
    registerTool: jest.fn((tool) => {
      registeredTools.push(tool);
    }),
  } as unknown as ExtensionAPI & { registeredTools: any[] };
};

describe('registerCrawlTool', () => {
  it('should register crawl tool with pi', () => {
    const mockPi = createMockPi();
    const config = loadConfig();

    registerCrawlTool(mockPi, config);

    expect(mockPi.registerTool).toHaveBeenCalledTimes(1);
    expect(mockPi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'crawl',
        label: 'Crawl Website',
      })
    );
  });

  it('should have correct parameter schema', () => {
    const mockPi = createMockPi();
    const config = loadConfig();

    registerCrawlTool(mockPi, config);

    const tool = mockPi.registeredTools[0];
    expect(tool.parameters).toBeDefined();
  });
});

describe('crawl tool execute', () => {
  let mockPi: ExtensionAPI & { registeredTools: any[] };
  let toolExecute: any;

  beforeEach(() => {
    mockPi = createMockPi();
    const config = loadConfig();
    registerCrawlTool(mockPi, config);
    toolExecute = mockPi.registeredTools[0].execute;
  });

  it('should return cancelled result when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'] },
      controller.signal,
      undefined,
      {}
    );

    expect(result.content[0].text).toBe('Crawl cancelled');
    expect(result.details.cancelled).toBe(true);
  });

  it('should call crawl4ai API with correct payload', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: '# Example\n\nThis is example content.',
          },
        ],
      },
    });

    await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'] },
      undefined,
      undefined,
      {}
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11235/crawl',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.urls).toEqual(['https://example.com']);
  });

  it('should return markdown content on success', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: '# Example\n\nThis is example content.',
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], format: 'markdown' },
      undefined,
      undefined,
      {}
    );

    expect(result.content[0].text).toContain('# Example');
    expect(result.content[0].text).toContain('This is example content.');
    expect(result.details.format).toBe('markdown');
    expect(result.details.results).toHaveLength(1);
  });

  it('should return HTML content when format is html', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            html: '<html><body>Example</body></html>',
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], format: 'html' },
      undefined,
      undefined,
      {}
    );

    expect(result.content[0].text).toContain('<html>');
    expect(result.details.format).toBe('html');
  });

  it('should return links when format is links', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            links: {
              internal: [
                { href: '/about', text: 'About' },
                { href: '/contact', text: 'Contact' },
              ],
              external: [
                { href: 'https://external.com', text: 'External' },
              ],
            },
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], format: 'links' },
      undefined,
      undefined,
      {}
    );

    expect(result.content[0].text).toContain('Internal Links');
    expect(result.content[0].text).toContain('/about');
    expect(result.content[0].text).toContain('External Links');
    expect(result.details.format).toBe('links');
  });

  it('should handle multiple URLs', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: 'Content from example.com',
          },
          {
            url: 'https://other.com',
            success: true,
            markdown: 'Content from other.com',
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com', 'https://other.com'] },
      undefined,
      undefined,
      {}
    );

    expect(result.content[0].text).toContain('Result 1');
    expect(result.content[0].text).toContain('Result 2');
    expect(result.details.results).toHaveLength(2);
  });

  it('should handle crawl errors gracefully', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: false,
            error_message: 'Failed to load page',
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'] },
      undefined,
      undefined,
      {}
    );

    expect(result.content[0].text).toContain('Error');
    expect(result.content[0].text).toContain('Failed to load page');
  });

  it('should throw on API error', async () => {
    mockFetch({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: 'Server error',
    });

    await expect(
      toolExecute(
        'tool-call-id',
        { urls: ['https://example.com'] },
        undefined,
        undefined,
        {}
      )
    ).rejects.toThrow('crawl4ai API error');
  });

  it('should throw on unsuccessful response', async () => {
    mockFetch({
      ok: true,
      data: {
        success: false,
        results: [],
      },
    });

    await expect(
      toolExecute(
        'tool-call-id',
        { urls: ['https://example.com'] },
        undefined,
        undefined,
        {}
      )
    ).rejects.toThrow('Crawl request failed');
  });

  it('should include waitFor in crawler config', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [] },
    });

    await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], waitFor: 2000 },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.wait_for).toContain('2000');
  });

  it('should include jsCode in crawler config', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [] },
    });

    await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], jsCode: 'document.querySelector(".btn").click()' },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.js_code).toContain('document.querySelector(".btn").click()');
  });

  it('should set cache bypass when bypassCache is true', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [] },
    });

    await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], bypassCache: true },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.cache_mode).toBe('BYPASS');
  });

  it('should include proxy in browser config when enabled', async () => {
    process.env.OXYLABS_USER = 'testuser';
    process.env.OXYLABS_PASS = 'testpass';

    // Re-register tool with proxy config
    const localMockPi = createMockPi();
    const config = loadConfig();
    registerCrawlTool(localMockPi, config);
    const execute = localMockPi.registeredTools[0].execute;

    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [] },
    });

    await execute(
      'tool-call-id',
      { urls: ['https://example.com'] },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.browser_config.proxy).toBeDefined();
    expect(body.browser_config.proxy.server).toBe('http://pr.oxylabs.io:7777');
  });
});
