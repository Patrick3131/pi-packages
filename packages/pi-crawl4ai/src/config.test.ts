/**
 * Tests for config module
 */

import { loadConfig, buildBrowserConfig } from './config';

describe('loadConfig', () => {
  it('should return default values when no env vars are set', () => {
    const config = loadConfig();

    expect(config.baseUrl).toBe('http://localhost:11235');
    expect(config.timeout).toBe(60000);
    expect(config.proxyEnabled).toBe(false);
    expect(config.proxy).toBeUndefined();
  });

  it('should use CRAWL4AI_BASE_URL when set', () => {
    process.env.CRAWL4AI_BASE_URL = 'http://custom-host:8080';

    const config = loadConfig();

    expect(config.baseUrl).toBe('http://custom-host:8080');
  });

  it('should use CRAWL4AI_TIMEOUT when set', () => {
    process.env.CRAWL4AI_TIMEOUT = '30000';

    const config = loadConfig();

    expect(config.timeout).toBe(30000);
  });

  it('should configure proxy from CRAWL4AI_PROXY_URL', () => {
    process.env.CRAWL4AI_PROXY_URL = 'http://user:pass@proxy.example.com:8080';

    const config = loadConfig();

    expect(config.proxyEnabled).toBe(true);
    expect(config.proxy).toEqual({
      server: 'http://proxy.example.com:8080',
      username: 'user',
      password: 'pass',
    });
  });

  it('should configure proxy from Oxylabs credentials', () => {
    process.env.OXYLABS_USER = 'testuser';
    process.env.OXYLABS_PASS = 'testpass';

    const config = loadConfig();

    expect(config.proxyEnabled).toBe(true);
    expect(config.proxy).toEqual({
      server: 'http://pr.oxylabs.io:7777',
      username: 'user-testuser',
      password: 'testpass',
    });
  });

  it('should use custom Oxylabs host and port', () => {
    process.env.OXYLABS_USER = 'testuser';
    process.env.OXYLABS_PASS = 'testpass';
    process.env.OXYLABS_HOST = 'custom.proxy.io';
    process.env.OXYLABS_PORT = '9999';

    const config = loadConfig();

    expect(config.proxy?.server).toBe('http://custom.proxy.io:9999');
  });

  it('should prefix Oxylabs username with user- if not present', () => {
    process.env.OXYLABS_USER = 'testuser';
    process.env.OXYLABS_PASS = 'testpass';

    const config = loadConfig();

    expect(config.proxy?.username).toBe('user-testuser');
  });

  it('should not prefix Oxylabs username if already prefixed', () => {
    process.env.OXYLABS_USER = 'user-testuser';
    process.env.OXYLABS_PASS = 'testpass';

    const config = loadConfig();

    expect(config.proxy?.username).toBe('user-testuser');
  });

  it('should prefer CRAWL4AI_PROXY_URL over Oxylabs', () => {
    process.env.CRAWL4AI_PROXY_URL = 'http://other:proxy@host:8080';
    process.env.OXYLABS_USER = 'testuser';
    process.env.OXYLABS_PASS = 'testpass';

    const config = loadConfig();

    expect(config.proxy?.server).toBe('http://host:8080');
    expect(config.proxy?.username).toBe('other');
  });

  it('should ignore invalid CRAWL4AI_PROXY_URL', () => {
    process.env.CRAWL4AI_PROXY_URL = 'not-a-valid-url';

    const config = loadConfig();

    expect(config.proxyEnabled).toBe(false);
  });

  it('should not enable proxy with only Oxylabs user', () => {
    process.env.OXYLABS_USER = 'testuser';

    const config = loadConfig();

    expect(config.proxyEnabled).toBe(false);
  });

  it('should not enable proxy with only Oxylabs pass', () => {
    process.env.OXYLABS_PASS = 'testpass';

    const config = loadConfig();

    expect(config.proxyEnabled).toBe(false);
  });
});

describe('buildBrowserConfig', () => {
  it('should return empty object when proxy is disabled', () => {
    const config = loadConfig();
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toEqual({});
  });

  it('should include proxy config when proxy is enabled', () => {
    process.env.OXYLABS_USER = 'testuser';
    process.env.OXYLABS_PASS = 'testpass';

    const config = loadConfig();
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toHaveProperty('proxy');
    expect(browserConfig.proxy).toEqual({
      server: 'http://pr.oxylabs.io:7777',
      username: 'user-testuser',
      password: 'testpass',
    });
  });
});
