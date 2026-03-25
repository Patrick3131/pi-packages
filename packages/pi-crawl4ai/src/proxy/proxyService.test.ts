/**
 * Tests for proxy service
 */

import { createProxyService } from "./proxyService";
import { genericAdapter, oxylabsAdapter, createCustomAdapter } from "./adapters";
import type { ProxyAdapter } from "./types";
import { resetEnv } from "../test-utils";

beforeEach(() => {
  resetEnv();
});

describe("createProxyService", () => {
  describe("with no adapters configured", () => {
    it("should return disabled service", () => {
      const service = createProxyService();

      expect(service.isEnabled()).toBe(false);
      expect(service.getActiveAdapterName()).toBeNull();
      expect(service.getProxyConfig()).toBeNull();
      expect(service.getBrowserConfig()).toEqual({});
    });

    it("should return built-in adapters", () => {
      const service = createProxyService();
      const adapters = service.getAdapters();

      expect(adapters).toContain(genericAdapter);
      expect(adapters).toContain(oxylabsAdapter);
    });
  });

  describe("with custom adapters", () => {
    it("should use first configured custom adapter", () => {
      const customAdapter: ProxyAdapter = {
        name: "custom-test",
        isConfigured: () => true,
        getConfig: () => ({
          server: "http://custom:9999",
          username: "customuser",
          password: "custompass",
          adapterName: "custom-test",
        }),
      };

      const service = createProxyService({
        customAdapters: [customAdapter],
      });

      expect(service.isEnabled()).toBe(true);
      expect(service.getActiveAdapterName()).toBe("custom-test");
    });

    it("should prioritize custom adapters over built-in", () => {
      // Set up oxylabs env vars
      process.env.OXYLABS_USER = "oxylabsuser";
      process.env.OXYLABS_PASS = "oxylabspass";

      const customAdapter: ProxyAdapter = {
        name: "priority",
        isConfigured: () => true,
        getConfig: () => ({
          server: "http://priority:8080",
          adapterName: "priority",
        }),
      };

      const service = createProxyService({
        customAdapters: [customAdapter],
      });

      expect(service.getActiveAdapterName()).toBe("priority");
    });
  });

  describe("with generic adapter (CRAWL4AI_PROXY_URL)", () => {
    it("should enable proxy when URL is set", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy.example.com:8080";

      const service = createProxyService();

      expect(service.isEnabled()).toBe(true);
      expect(service.getActiveAdapterName()).toBe("generic");
    });

    it("should parse proxy URL correctly", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://myuser:mypass@proxy.example.com:9999";

      const service = createProxyService();
      const config = service.getProxyConfig();

      expect(config).toEqual({
        server: "http://proxy.example.com:9999",
        username: "myuser",
        password: "mypass",
        adapterName: "generic",
      });
    });

    it("should handle URL without auth", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://proxy.example.com:8080";

      const service = createProxyService();
      const config = service.getProxyConfig();

      expect(config?.server).toBe("http://proxy.example.com:8080");
      expect(config?.username).toBeUndefined();
      expect(config?.password).toBeUndefined();
    });

    it("should return correct browser config", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy:8080";

      const service = createProxyService();
      const browserConfig = service.getBrowserConfig();

      expect(browserConfig).toEqual({
        proxy: {
          server: "http://proxy:8080",
          username: "user",
          password: "pass",
        },
      });
    });
  });

  describe("with oxylabs adapter", () => {
    it("should enable proxy when credentials are set", () => {
      process.env.OXYLABS_USER = "testuser";
      process.env.OXYLABS_PASS = "testpass";

      const service = createProxyService();

      expect(service.isEnabled()).toBe(true);
      expect(service.getActiveAdapterName()).toBe("oxylabs");
    });

    it("should not enable proxy with only username", () => {
      process.env.OXYLABS_USER = "testuser";

      const service = createProxyService();

      expect(service.isEnabled()).toBe(false);
    });

    it("should not enable proxy with only password", () => {
      process.env.OXYLABS_PASS = "testpass";

      const service = createProxyService();

      expect(service.isEnabled()).toBe(false);
    });

    it("should add user- prefix to username", () => {
      process.env.OXYLABS_USER = "testuser";
      process.env.OXYLABS_PASS = "testpass";

      const service = createProxyService();
      const config = service.getProxyConfig();

      expect(config?.username).toBe("user-testuser");
    });

    it("should not double-prefix username", () => {
      process.env.OXYLABS_USER = "user-testuser";
      process.env.OXYLABS_PASS = "testpass";

      const service = createProxyService();
      const config = service.getProxyConfig();

      expect(config?.username).toBe("user-testuser");
    });

    it("should use custom host and port", () => {
      process.env.OXYLABS_USER = "testuser";
      process.env.OXYLABS_PASS = "testpass";
      process.env.OXYLABS_HOST = "custom.proxy.io";
      process.env.OXYLABS_PORT = "9999";

      const service = createProxyService();
      const config = service.getProxyConfig();

      expect(config?.server).toBe("http://custom.proxy.io:9999");
    });
  });

  describe("adapter priority", () => {
    it("should prefer generic over oxylabs", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://generic:8080";
      process.env.OXYLABS_USER = "oxylabsuser";
      process.env.OXYLABS_PASS = "oxylabspass";

      const service = createProxyService();

      expect(service.getActiveAdapterName()).toBe("generic");
    });
  });

  describe("logging", () => {
    it("should call log function when adapter is found", () => {
      const logs: Array<{ level: string; message: string }> = [];
      const log = (level: "info" | "warn" | "error", message: string) => {
        logs.push({ level, message });
      };

      // Set env vars BEFORE creating service
      process.env.OXYLABS_USER = "testuser";
      process.env.OXYLABS_PASS = "testpass";

      const service = createProxyService({ log });

      // Trigger adapter selection by calling isEnabled
      service.isEnabled();

      // Should have logged something
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe("rotation service", () => {
    it("should return null rotation when no proxy configured", () => {
      const service = createProxyService();
      const rotation = service.getRotation();

      expect(rotation).toBeNull();
    });

    it("should return rotation service when proxy configured", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy:8080";

      const service = createProxyService();
      const rotation = service.getRotation();

      expect(rotation).not.toBeNull();
      expect(rotation?.isEnabled()).toBe(true);
    });

    it("should use rotation for browser config", () => {
      process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy:8080";

      const service = createProxyService();
      const browserConfig = service.getBrowserConfig();

      expect(browserConfig).toHaveProperty("proxy");
    });
  });

  describe("caching", () => {
    it("should cache adapter selection", () => {
      process.env.OXYLABS_USER = "testuser";
      process.env.OXYLABS_PASS = "testpass";

      const service = createProxyService();

      // Multiple calls should return same result without re-checking
      const name1 = service.getActiveAdapterName();
      const name2 = service.getActiveAdapterName();
      const config1 = service.getProxyConfig();
      const config2 = service.getProxyConfig();

      expect(name1).toBe(name2);
      expect(config1).toBe(config2);
    });
  });
});

describe("createCustomAdapter", () => {
  it("should create adapter from URL", () => {
    const adapter = createCustomAdapter({
      url: "http://user:pass@custom.proxy:8080",
    });

    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.name).toBe("custom");

    const config = adapter.getConfig();
    expect(config.server).toBe("http://custom.proxy:8080");
    expect(config.username).toBe("user");
    expect(config.password).toBe("pass");
  });

  it("should create adapter from host and port", () => {
    const adapter = createCustomAdapter({
      host: "custom.proxy",
      port: "9999",
      username: "testuser",
      password: "testpass",
    });

    expect(adapter.isConfigured()).toBe(true);

    const config = adapter.getConfig();
    expect(config.server).toBe("http://custom.proxy:9999");
  });

  it("should return unconfigured for missing required fields", () => {
    const adapter = createCustomAdapter({
      host: "custom.proxy",
      // Missing port
    });

    expect(adapter.isConfigured()).toBe(false);
  });

  it("should support pre-built endpoints for rotation", () => {
    const adapter = createCustomAdapter({
      host: "proxy",
      endpoints: [
        { id: "1", server: "http://proxy:8001", provider: "custom" },
        { id: "2", server: "http://proxy:8002", provider: "custom" },
      ],
    });

    expect(adapter.isConfigured()).toBe(true);

    const result = adapter.getEndpoints?.();
    expect(result?.configured).toBe(true);
    expect(result?.endpoints).toHaveLength(2);
  });

  it("should throw for invalid URL", () => {
    const adapter = createCustomAdapter({
      url: "not-a-valid-url",
    });

    expect(adapter.isConfigured()).toBe(true); // URL is set
    expect(() => adapter.getConfig()).toThrow();
  });
});
