/**
 * Contract tests - validate our output matches crawl4ai API expectations.
 *
 * These tests catch issues like using `proxy` instead of `proxy_config`.
 * They document the expected API schema and fail if we deviate from it.
 */

import { createProxyService } from "./proxyService";
import { createRotationService } from "./rotationService";
import { createCustomAdapter } from "./adapters/customAdapter";

describe("crawl4ai API Contract", () => {
  /**
   * crawl4ai BrowserConfig expects:
   * - proxy: string URL (e.g., "http://user:pass@host:port")
   * - proxy_config: object with { server, username?, password? }
   *
   * We use proxy_config for structured config.
   */
  describe("browser_config.proxy_config schema", () => {
    const PROXY_CONFIG_SCHEMA = {
      server: expect.any(String),
      username: expect.any(String),
      password: expect.any(String),
    };

    it("should output proxy_config (not proxy) for structured config", () => {
      const service = createProxyService({
        customAdapters: [
          createCustomAdapter({
            url: "http://user:pass@proxy:8080",
          }),
        ],
      });

      const browserConfig = service.getBrowserConfig();

      // Must use proxy_config, not proxy (which expects a string)
      expect(browserConfig).toHaveProperty("proxy_config");
      expect(browserConfig).not.toHaveProperty("proxy");
    });

    it("should match proxy_config schema", () => {
      const service = createProxyService({
        customAdapters: [
          createCustomAdapter({
            host: "proxy.example.com",
            port: "8080",
            username: "testuser",
            password: "testpass",
          }),
        ],
      });

      const browserConfig = service.getBrowserConfig();

      expect(browserConfig.proxy_config).toEqual(PROXY_CONFIG_SCHEMA);
    });

    it("should include all required fields", () => {
      const service = createProxyService({
        customAdapters: [
          createCustomAdapter({
            host: "proxy.example.com",
            port: "8080",
            username: "testuser",
            password: "testpass",
          }),
        ],
      });

      const { proxy_config } = service.getBrowserConfig() as { proxy_config: { server: string } };

      // Required fields
      expect(proxy_config).toHaveProperty("server");
      expect(typeof proxy_config.server).toBe("string");
      expect(proxy_config.server).toMatch(/^https?:\/\//);

      // Optional fields (when provided)
      expect(proxy_config).toHaveProperty("username");
      expect(proxy_config).toHaveProperty("password");
    });

    it("should return empty object when no proxy configured", () => {
      const service = createProxyService();
      const browserConfig = service.getBrowserConfig();

      // No proxy_config when disabled
      expect(browserConfig).toEqual({});
    });
  });

  describe("rotation service browser_config", () => {
    it("should use proxy_config for rotated endpoints", () => {
      const endpoints = [
        { id: "1", server: "http://proxy1:8080", username: "u1", password: "p1", provider: "test" },
        { id: "2", server: "http://proxy2:8080", username: "u2", password: "p2", provider: "test" },
      ];

      const service = createRotationService(endpoints);
      const browserConfig = service.getBrowserConfig();

      // Must use proxy_config
      expect(browserConfig).toHaveProperty("proxy_config");
      expect(browserConfig).not.toHaveProperty("proxy");
    });

    it("should match proxy_config schema for rotated endpoint", () => {
      const endpoints = [
        { id: "1", server: "http://proxy:8080", username: "user", password: "pass", provider: "test" },
      ];

      const service = createRotationService(endpoints);
      const browserConfig = service.getBrowserConfig();

      expect(browserConfig.proxy_config).toEqual({
        server: "http://proxy:8080",
        username: "user",
        password: "pass",
      });
    });

    it("should return empty object when all endpoints quarantined", () => {
      const endpoints = [
        { id: "1", server: "http://proxy:8080", provider: "test" },
      ];

      const service = createRotationService(endpoints);
      service.quarantine("1");

      const browserConfig = service.getBrowserConfig();

      expect(browserConfig).toEqual({});
    });
  });

  describe("getBrowserConfigForEndpoint", () => {
    it("should use proxy_config for specific endpoint", () => {
      const endpoint = {
        id: "test",
        server: "http://proxy:8080",
        username: "user",
        password: "pass",
        provider: "test",
      };

      const service = createRotationService([endpoint]);
      const browserConfig = service.getBrowserConfigForEndpoint(endpoint);

      expect(browserConfig).toHaveProperty("proxy_config");
      expect(browserConfig).not.toHaveProperty("proxy");
    });
  });

  describe("server URL format", () => {
    it("should format server URL with protocol", () => {
      const service = createProxyService({
        customAdapters: [
          createCustomAdapter({
            host: "isp.oxylabs.io",
            port: "8001",
            username: "user",
            password: "pass",
          }),
        ],
      });

      const { proxy_config } = service.getBrowserConfig() as { proxy_config: { server: string } };

      // Server must include protocol
      expect(proxy_config.server).toBe("http://isp.oxylabs.io:8001");
    });

    it("should preserve protocol from URL", () => {
      const service = createProxyService({
        customAdapters: [
          createCustomAdapter({
            url: "https://user:pass@secure.proxy:8443",
          }),
        ],
      });

      const { proxy_config } = service.getBrowserConfig() as { proxy_config: { server: string } };

      // Port 443 is default for https, so URL omits it; use custom port to verify
      expect(proxy_config.server).toBe("https://secure.proxy:8443");
    });
  });
});

/**
 * Integration-style test that would catch the proxy vs proxy_config issue.
 * This simulates what crawl4ai's BrowserConfig.load() expects.
 */
describe("crawl4ai BrowserConfig.load() compatibility", () => {
  it("should produce valid browser_config for crawl4ai", () => {
    const service = createProxyService({
      customAdapters: [
        createCustomAdapter({
          host: "proxy.example.com",
          port: "8080",
          username: "user",
          password: "pass",
        }),
      ],
    });

    const browserConfig = service.getBrowserConfig();

    // Simulate what crawl4ai expects
    // From async_configs.py:
    // - proxy: Optional[str] - a string URL
    // - proxy_config: ProxyConfig or dict - {server, username?, password?}

    // If we use proxy_config, it must be a dict with server
    if (browserConfig.proxy_config) {
      expect(typeof (browserConfig.proxy_config as { server: string }).server).toBe("string");
      expect((browserConfig.proxy_config as { server: string }).server).toBeTruthy();
    }

    // If we use proxy, it must be a string (NOT an object)
    if (browserConfig.proxy) {
      expect(typeof browserConfig.proxy).toBe("string");
      // This would fail if we accidentally used proxy: {...}
    }
  });

  it("should NOT send proxy as an object (common mistake)", () => {
    const service = createProxyService({
      customAdapters: [
        createCustomAdapter({
          url: "http://user:pass@proxy:8080",
        }),
      ],
    });

    const browserConfig = service.getBrowserConfig();

    // This is the bug we had: sending proxy as an object
    // crawl4ai expects proxy to be a STRING or proxy_config to be an OBJECT
    if (typeof (browserConfig as any).proxy === "object") {
      // This should NEVER happen - proxy should be a string or not present
      fail("proxy should not be an object - use proxy_config instead");
    }

    // Correct: proxy_config is an object
    expect(typeof browserConfig.proxy_config).toBe("object");
  });
});
