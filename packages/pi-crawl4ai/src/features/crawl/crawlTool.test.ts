/**
 * Tests for crawl tool
 */

import { loadConfig } from '../../config';
import { registerCrawlTool } from './crawlTool';
import { resetRequestPacingState } from './requestPacing';
import { mockFetch } from '../../test-utils';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test directory for save functionality
const TEST_SAVE_DIR = './__test_crawl_save__';

function cleanupTestDir() {
  try {
    rmSync(TEST_SAVE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

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

  it('should include deepCrawl parameter in schema', () => {
    const mockPi = createMockPi();
    const config = loadConfig();

    registerCrawlTool(mockPi, config);

    const tool = mockPi.registeredTools[0];
    expect(tool.parameters).toBeDefined();
    // Check that deepCrawl is an optional object parameter
    expect(tool.parameters.properties.deepCrawl).toBeDefined();
  });

  it('should describe progressive saved output', () => {
    const mockPi = createMockPi();
    const config = loadConfig();

    registerCrawlTool(mockPi, config);

    const tool = mockPi.registeredTools[0];
    expect(tool.promptSnippet).toContain('index');
    expect(tool.promptSnippet).toContain('crawl_read');
    expect(tool.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('crawl-manifest.json'),
        expect.stringContaining('crawl_read'),
      ])
    );
  });
});

describe('crawl tool execute', () => {
  let mockPi: ExtensionAPI & { registeredTools: any[] };
  let toolExecute: any;

  beforeEach(() => {
    resetRequestPacingState();
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

  it('should send Authorization Bearer when apiToken is configured', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: {
        success: true,
        results: [{ url: 'https://example.com', success: true, markdown: 'ok' }],
      },
    });

    const localMockPi = createMockPi();
    const config = loadConfig();
    config.apiToken = 'test-api-token';
    config.raw.apiToken = 'test-api-token';
    registerCrawlTool(localMockPi, config);
    const execute = localMockPi.registeredTools[0].execute;

    await execute(
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-token',
        },
      })
    );
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

    expect(result.content[0].text).toContain('*Execution:*');
    expect(result.content[0].text).toContain('egress=server-managed');
    expect(result.content[0].text).toContain('# Example');
    expect(result.content[0].text).toContain('This is example content.');
    expect(result.details.format).toBe('markdown');
    expect(result.details.results).toHaveLength(1);
    expect(result.details.execution).toEqual({
      egress: 'server-managed',
    });
  });

  it('should handle MarkdownGenerationResult object from API', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: {
              raw_markdown: '# Example\n\nThis is example content.',
              markdown_with_citations: '# Example\n\nThis is example content.⟨1⟩',
              references_markdown: '\n## References\n\n⟨1⟩ https://example.com\n',
              fit_markdown: '# Example\n\nFiltered content.',
              fit_html: '<h1>Example</h1>',
            },
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

    // Prefer fit_markdown when available (token-budget default)
    expect(result.content[0].text).toContain('# Example');
    expect(result.content[0].text).toContain('Filtered content.');
    expect(result.content[0].text).not.toContain('This is example content.');
    expect(result.content[0].text).not.toContain('[object Object]');
    expect(result.details.format).toBe('markdown');
    expect(result.details.results[0].usedFitMarkdown).toBe(true);
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


  it('should omit client-side browser configuration', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [] },
    });

    await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'] },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.browser_config).toBeUndefined();
  });

  it('should apply global request pacing between calls', async () => {
    jest.useFakeTimers();

    try {
      const localMockPi = createMockPi();
      const config = loadConfig();
      config.raw.minRequestIntervalMs = 5000;
      registerCrawlTool(localMockPi, config);
      const execute = localMockPi.registeredTools[0].execute;

      const fetchMock = mockFetch({ ok: true, data: { success: true, results: [] } });

      await execute('tool-call-id-1', { urls: ['https://example.com'] }, undefined, undefined, {});
      const secondCall = execute('tool-call-id-2', { urls: ['https://example.com'] }, undefined, undefined, {});

      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(4999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      const result = await secondCall;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain('*Execution:*');
      expect(result.details.minRequestIntervalMs).toBe(5000);
      expect(result.details.rateLimitWaitedMs).toBe(5000);
    } finally {
      jest.useRealTimers();
    }
  });

});

describe('crawl tool deep crawl', () => {
  let mockPi: ExtensionAPI & { registeredTools: any[] };
  let toolExecute: any;

  beforeEach(() => {
    mockPi = createMockPi();
    const config = loadConfig();
    registerCrawlTool(mockPi, config);
    toolExecute = mockPi.registeredTools[0].execute;
  });

  it('should throw error when deep crawl is used with multiple URLs', async () => {
    await expect(
      toolExecute(
        'tool-call-id',
        {
          urls: ['https://example.com', 'https://other.com'],
          deepCrawl: { maxDepth: 2 }
        },
        undefined,
        undefined,
        {}
      )
    ).rejects.toThrow('Deep crawling requires exactly one start URL');
  });

  it('should include deep_crawl_strategy in crawler config', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2 }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.deep_crawl_strategy).toBeDefined();
    expect(body.crawler_config.deep_crawl_strategy.type).toBe('BFSDeepCrawlStrategy');
    expect(body.crawler_config.deep_crawl_strategy.params.max_depth).toBe(2);
    expect(body.crawler_config.deep_crawl_strategy.params.max_pages).toBe(10);
    expect(body.crawler_config.deep_crawl_strategy.params.include_external).toBe(false);
  });

  it('should use DFS strategy when specified', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 3, strategy: 'dfs' }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.deep_crawl_strategy.type).toBe('DFSDeepCrawlStrategy');
    expect(body.crawler_config.deep_crawl_strategy.params.max_depth).toBe(3);
  });

  it('should use BestFirst strategy when specified', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 3, strategy: 'best-first', scoreThreshold: 0.5 }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.deep_crawl_strategy.type).toBe('BestFirstCrawlingStrategy');
    expect(body.crawler_config.deep_crawl_strategy.params.score_threshold).toBe(0.5);
  });

  it('should include custom maxPages', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2, maxPages: 50 }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.deep_crawl_strategy.params.max_pages).toBe(50);
  });

  it('should include includeExternal when true', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2, includeExternal: true }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.deep_crawl_strategy.params.include_external).toBe(true);
  });

  it('should include URL pattern filters', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: {
          maxDepth: 2,
          includePatterns: ['/docs/*', '*.html'],
          excludePatterns: ['/admin/*']
        }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const strategy = body.crawler_config.deep_crawl_strategy;

    expect(strategy.params.filter_chain).toBeDefined();
    expect(strategy.params.filter_chain.type).toBe('FilterChain');
    expect(strategy.params.filter_chain.params.filters).toHaveLength(1);

    const patternFilter = strategy.params.filter_chain.params.filters[0];
    expect(patternFilter.type).toBe('URLPatternFilter');
    expect(patternFilter.params.patterns).toContain('/docs/*');
    expect(patternFilter.params.patterns).toContain('*.html');
    expect(patternFilter.params.patterns).toContain('!/admin/*');
  });

  it('should include domain filter', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: { success: true, results: [{ url: 'https://example.com', success: true, markdown: 'test' }] },
    });

    await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: {
          maxDepth: 2,
          allowedDomains: ['example.com', 'docs.example.com']
        }
      },
      undefined,
      undefined,
      {}
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const strategy = body.crawler_config.deep_crawl_strategy;

    expect(strategy.params.filter_chain).toBeDefined();
    const domainFilter = strategy.params.filter_chain.params.filters.find(
      (f: any) => f.type === 'DomainFilter'
    );
    expect(domainFilter).toBeDefined();
    expect(domainFilter.params.allowed_domains).toContain('example.com');
    expect(domainFilter.params.allowed_domains).toContain('docs.example.com');
  });

  it('should format deep crawl results with depth grouping', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: 'Home page content',
            metadata: { depth: 0 }
          },
          {
            url: 'https://example.com/docs',
            success: true,
            markdown: 'Docs page content',
            metadata: { depth: 1 }
          },
          {
            url: 'https://example.com/docs/api',
            success: true,
            markdown: 'API docs content',
            metadata: { depth: 2 }
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2 }
      },
      undefined,
      undefined,
      {}
    );

    // Multi-page deep crawl uses files/index mode by default (token budget)
    expect(result.content[0].text).toContain('Deep Crawl Results (3 pages');
    expect(result.content[0].text).toContain('Return mode: files');
    expect(result.content[0].text).toContain('Depth 0 (1 pages)');
    expect(result.content[0].text).toContain('Depth 1 (1 pages)');
    expect(result.content[0].text).toContain('Depth 2 (1 pages)');
    expect(result.content[0].text).toContain('https://example.com');
    expect(result.content[0].text).toContain('https://example.com/docs');
    expect(result.content[0].text).toContain('https://example.com/docs/api');
    // Full bodies should not be inlined as page sections — only short excerpts
    expect(result.content[0].text).not.toContain('## https://example.com\n\nHome page content');
    expect(result.content[0].text).toContain('excerpt: Home page content');
    expect(result.details.returnMode).toBe('files');
    expect(result.details.savedPath).toBeDefined();
  });

  it('should include deep crawl metadata in result details', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: 'test', metadata: { depth: 0 } },
          { url: 'https://example.com/page', success: true, markdown: 'test', metadata: { depth: 1 } },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2, maxPages: 50 }
      },
      undefined,
      undefined,
      {}
    );

    expect(result.details.deepCrawl).toBeDefined();
    expect(result.details.deepCrawl.totalPages).toBe(2);
    expect(result.details.deepCrawl.maxDepth).toBe(2);
  });

  it('should mark failed pages in deep crawl output', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: 'Home page content',
            metadata: { depth: 0 }
          },
          {
            url: 'https://example.com/broken',
            success: false,
            error_message: '404 Not Found',
            metadata: { depth: 1 }
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2 }
      },
      undefined,
      undefined,
      {}
    );

    expect(result.content[0].text).toContain('[error] https://example.com/broken');
    expect(result.content[0].text).toContain('[ok] https://example.com');
    expect(result.details.returnMode).toBe('files');
  });

  it('should use regular format for single-page deep crawl result', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://example.com',
            success: true,
            markdown: 'Home page content',
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2 }
      },
      undefined,
      undefined,
      {}
    );

    // Single result stays inline (not multi-page files mode)
    expect(result.content[0].text).not.toContain('Deep Crawl Results');
    expect(result.content[0].text).toContain('## https://example.com');
    expect(result.content[0].text).toContain('Home page content');
    expect(result.details.returnMode).toBe('inline');
    expect(result.details.deepCrawl).toEqual({
      totalPages: 1,
      maxDepth: 2,
      maxPages: 10,
    });
  });

  it('should work without deepCrawl parameter (backward compatibility)', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: 'test' },
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

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.crawler_config.deep_crawl_strategy).toBeUndefined();
    expect(result.details.deepCrawl).toBeUndefined();
  });
});

describe('crawl tool save functionality', () => {
  let mockPi: ExtensionAPI & { registeredTools: any[] };
  let toolExecute: any;

  beforeEach(() => {
    mockPi = createMockPi();
    const config = loadConfig();
    registerCrawlTool(mockPi, config);
    toolExecute = mockPi.registeredTools[0].execute;
    cleanupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  it('should not save when save parameter is undefined', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: 'test' },
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

    expect(result.details.savedPath).toBeUndefined();
    expect(result.content[0].text).not.toContain('saved to:');
  });

  it('should not save when save parameter is false', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: 'test' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], save: false },
      undefined,
      undefined,
      {}
    );

    expect(result.details.savedPath).toBeUndefined();
  });

  it('should save to default directory when save is true', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: '# Test Content' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], save: true },
      undefined,
      undefined,
      {}
    );

    expect(result.details.savedPath).toBeDefined();
    expect(result.details.savedPath).toMatch(/output-crawl4ai/);
    expect(result.content[0].text).toContain('saved to:');
    expect(result.content[0].text).toContain('output-crawl4ai');
  });

  it('should save to custom directory when save is a string', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: '# Test Content' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], save: TEST_SAVE_DIR },
      undefined,
      undefined,
      {}
    );

    expect(result.details.savedPath).toBeDefined();
    expect(result.details.savedPath).toContain('__test_crawl_save__');
    expect(existsSync(result.details.savedPath)).toBe(true);
    expect(existsSync(join(result.details.savedPath, 'crawl-manifest.json'))).toBe(true);
    expect(existsSync(join(result.details.savedPath, 'example.com/index.md'))).toBe(true);
  });

  it('should save multiple pages', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: '# Home' },
          { url: 'https://example.com/docs', success: true, markdown: '# Docs' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com', 'https://example.com/docs'], save: TEST_SAVE_DIR },
      undefined,
      undefined,
      {}
    );

    expect(existsSync(join(result.details.savedPath, 'example.com/index.md'))).toBe(true);
    expect(existsSync(join(result.details.savedPath, 'example.com/docs.md'))).toBe(true);
  });

  it('should expose the manifest and exact nested page paths in files mode', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          {
            url: 'https://github.com/earendil-works/pi/issues/5512',
            success: true,
            markdown: '# Issue 5512',
          },
          {
            url: 'https://github.com/earendil-works/pi/pulls/12',
            success: true,
            markdown: '# Pull 12',
          },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: [
          'https://github.com/earendil-works/pi/issues/5512',
          'https://github.com/earendil-works/pi/pulls/12',
        ],
        returnMode: 'files',
        save: TEST_SAVE_DIR,
      },
      undefined,
      undefined,
      {}
    );

    const issuePath = join(
      result.details.savedPath,
      'github.com/earendil-works/pi/issues/5512.md'
    );
    const pullPath = join(result.details.savedPath, 'github.com/earendil-works/pi/pulls/12.md');
    const manifestPath = join(result.details.savedPath, 'crawl-manifest.json');

    expect(existsSync(issuePath)).toBe(true);
    expect(existsSync(pullPath)).toBe(true);
    expect(result.details.manifestPath).toBe(manifestPath);
    expect(result.details.savedFiles).toEqual([
      expect.objectContaining({
        url: 'https://github.com/earendil-works/pi/issues/5512',
        relativePath: 'github.com/earendil-works/pi/issues/5512.md',
        path: issuePath,
      }),
      expect.objectContaining({
        url: 'https://github.com/earendil-works/pi/pulls/12',
        relativePath: 'github.com/earendil-works/pi/pulls/12.md',
        path: pullPath,
      }),
    ]);
    expect(result.details.results[0].filePath).toBe(issuePath);
    expect(result.content[0].text).toContain(`Manifest: ${manifestPath}`);
    expect(result.content[0].text).toContain(
      `https://github.com/earendil-works/pi/issues/5512 → ${issuePath}`
    );
    expect(result.content[0].text).toContain(
      `https://github.com/earendil-works/pi/pulls/12 → ${pullPath}`
    );
    expect(result.content[0].text).not.toContain('github.com-earendil-works-pi-issues-5512.md');
  });

  it('should preserve save=false for files mode and explain that no files exist', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com/a', success: true, markdown: '# A' },
          { url: 'https://example.com/b', success: true, markdown: '# B' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com/a', 'https://example.com/b'],
        returnMode: 'files',
        save: false,
      },
      undefined,
      undefined,
      {}
    );

    expect(result.details.savedPath).toBeUndefined();
    expect(result.details.manifestPath).toBeUndefined();
    expect(result.details.savedFiles).toBeUndefined();
    expect(result.content[0].text).toContain('No crawl files exist for this result');
    expect(result.content[0].text).toContain('save=true');
  });

  it('should explain that unsaved truncated inline output is not recoverable', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com/long', success: true, markdown: 'x'.repeat(1_000) },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com/long'],
        returnMode: 'inline',
        maxCharsPerPage: 100,
        maxCharsPerCall: 5_000,
      },
      undefined,
      undefined,
      {}
    );

    expect(result.details.savedPath).toBeUndefined();
    expect(result.details.truncated).toBe(true);
    expect(result.content[0].text).toContain('not recoverable via crawl_read');
    expect(result.content[0].text).toContain('save=true');
  });

  it('should save deep crawl results', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: 'Home', metadata: { depth: 0 } },
          { url: 'https://example.com/page1', success: true, markdown: 'Page 1', metadata: { depth: 1 } },
          { url: 'https://example.com/page2', success: true, markdown: 'Page 2', metadata: { depth: 1 } },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      {
        urls: ['https://example.com'],
        deepCrawl: { maxDepth: 2 },
        save: TEST_SAVE_DIR,
      },
      undefined,
      undefined,
      {}
    );

    expect(result.details.savedPath).toBeDefined();
    expect(result.content[0].text).toContain('saved to:');
    expect(existsSync(join(result.details.savedPath, 'example.com/index.md'))).toBe(true);
    expect(existsSync(join(result.details.savedPath, 'example.com/page1.md'))).toBe(true);
    expect(existsSync(join(result.details.savedPath, 'example.com/page2.md'))).toBe(true);

    // Check manifest includes deep crawl info
    const manifest = JSON.parse(readFileSync(join(result.details.savedPath, 'crawl-manifest.json'), 'utf-8'));
    expect(manifest.deepCrawl).toBeDefined();
    expect(manifest.deepCrawl.maxDepth).toBe(2);
  });

  it('should include manifest with correct metadata', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, markdown: 'test' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], save: TEST_SAVE_DIR },
      undefined,
      undefined,
      {}
    );

    const manifest = JSON.parse(readFileSync(join(result.details.savedPath, 'crawl-manifest.json'), 'utf-8'));

    expect(manifest.totalPages).toBe(1);
    expect(manifest.format).toBe('markdown');
    expect(manifest.urls).toEqual(['https://example.com']);
    expect(manifest.files).toHaveLength(1);
    expect(manifest.timestamp).toBeDefined();
  });

  it('should save HTML format with correct extension', async () => {
    mockFetch({
      ok: true,
      data: {
        success: true,
        results: [
          { url: 'https://example.com', success: true, html: '<html></html>' },
        ],
      },
    });

    const result = await toolExecute(
      'tool-call-id',
      { urls: ['https://example.com'], format: 'html', save: TEST_SAVE_DIR },
      undefined,
      undefined,
      {}
    );

    expect(existsSync(join(result.details.savedPath, 'example.com/index.html'))).toBe(true);
  });
});
