/**
 * Tests for custom proxy adapter factory
 */

import { createCustomAdapter, type CustomProxySettings } from "./customAdapter";
import type { ProxyEndpoint } from "../types";

describe("createCustomAdapter", () => {
  describe("isConfigured", () => {
    it("should return false for empty settings", () => {
      const adapter = createCustomAdapter({});
      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return true when url is set", () => {
      const adapter = createCustomAdapter({
        url: "http://proxy.example.com:8080",
      });
      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return true when host and port are set", () => {
      const adapter = createCustomAdapter({
        host: "proxy.example.com",
        port: "8080",
      });
      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when only host is set", () => {
      const adapter = createCustomAdapter({
        host: "proxy.example.com",
      });
      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when only port is set", () => {
      const adapter = createCustomAdapter({
        port: "8080",
      });
      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return true when endpoints are provided", () => {
      const adapter = createCustomAdapter({
        endpoints: [
          { id: "1", server: "http://proxy:8080", provider: "custom" },
        ],
      });
      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false for empty endpoints array", () => {
      const adapter = createCustomAdapter({
        endpoints: [],
      });
      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe("getConfig", () => {
    describe("from URL", () => {
      it("should parse URL with auth", () => {
        const adapter = createCustomAdapter({
          url: "http://user:pass@proxy.example.com:8080",
        });

        const config = adapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:8080");
        expect(config.username).toBe("user");
        expect(config.password).toBe("pass");
        expect(config.adapterName).toBe("custom");
      });

      it("should parse URL without auth", () => {
        const adapter = createCustomAdapter({
          url: "http://proxy.example.com:8080",
        });

        const config = adapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:8080");
        expect(config.username).toBeUndefined();
        expect(config.password).toBeUndefined();
      });

      it("should throw for invalid URL", () => {
        const adapter = createCustomAdapter({
          url: "not-a-valid-url",
        });

        expect(() => adapter.getConfig()).toThrow("Invalid proxy URL");
      });
    });

    describe("from host and port", () => {
      it("should build server URL from host and port", () => {
        const adapter = createCustomAdapter({
          host: "proxy.example.com",
          port: "8080",
        });

        const config = adapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:8080");
      });

      it("should include credentials when provided", () => {
        const adapter = createCustomAdapter({
          host: "proxy.example.com",
          port: "8080",
          username: "testuser",
          password: "testpass",
        });

        const config = adapter.getConfig();

        expect(config.username).toBe("testuser");
        expect(config.password).toBe("testpass");
      });
    });

    describe("from endpoints", () => {
      it("should return first endpoint config", () => {
        const endpoints: ProxyEndpoint[] = [
          {
            id: "1",
            server: "http://proxy1:8080",
            username: "user1",
            password: "pass1",
            provider: "custom",
          },
          {
            id: "2",
            server: "http://proxy2:8080",
            username: "user2",
            password: "pass2",
            provider: "custom",
          },
        ];

        const adapter = createCustomAdapter({ endpoints });
        const config = adapter.getConfig();

        expect(config.server).toBe("http://proxy1:8080");
        expect(config.username).toBe("user1");
        expect(config.password).toBe("pass1");
      });

      it("should handle endpoints without auth", () => {
        const endpoints: ProxyEndpoint[] = [
          { id: "1", server: "http://proxy:8080", provider: "custom" },
        ];

        const adapter = createCustomAdapter({ endpoints });
        const config = adapter.getConfig();

        expect(config.username).toBeUndefined();
        expect(config.password).toBeUndefined();
      });
    });

    it("should throw when not configured", () => {
      const adapter = createCustomAdapter({});
      expect(() => adapter.getConfig()).toThrow(
        "Custom proxy requires either url, endpoints, or host+port"
      );
    });

    describe("priority", () => {
      it("should prefer URL over host/port", () => {
        const adapter = createCustomAdapter({
          url: "http://url-proxy:8080",
          host: "host-proxy",
          port: "9999",
        });

        const config = adapter.getConfig();

        expect(config.server).toBe("http://url-proxy:8080");
      });

      it("should prefer URL over endpoints", () => {
        const adapter = createCustomAdapter({
          url: "http://url-proxy:8080",
          endpoints: [
            { id: "1", server: "http://endpoint-proxy:8080", provider: "custom" },
          ],
        });

        const config = adapter.getConfig();

        // URL has priority over endpoints
        expect(config.server).toBe("http://url-proxy:8080");
      });
    });
  });

  describe("getEndpoints", () => {
    it("should return empty result when not configured", () => {
      const adapter = createCustomAdapter({});
      const result = adapter.getEndpoints?.();

      expect(result?.configured).toBe(false);
      expect(result?.endpoints).toEqual([]);
    });

    it("should return provided endpoints", () => {
      const endpoints: ProxyEndpoint[] = [
        { id: "1", server: "http://proxy1:8080", provider: "custom" },
        { id: "2", server: "http://proxy2:8080", provider: "custom" },
      ];

      const adapter = createCustomAdapter({ endpoints });
      const result = adapter.getEndpoints?.();

      expect(result?.configured).toBe(true);
      expect(result?.endpoints).toEqual(endpoints);
    });

    it("should generate single endpoint from URL config", () => {
      const adapter = createCustomAdapter({
        url: "http://user:pass@proxy:8080",
      });

      const result = adapter.getEndpoints?.();

      expect(result?.configured).toBe(true);
      expect(result?.endpoints).toHaveLength(1);
      expect(result?.endpoints[0]).toEqual({
        id: "custom-0",
        server: "http://proxy:8080",
        username: "user",
        password: "pass",
        provider: "custom",
      });
    });

    it("should generate single endpoint from host/port config", () => {
      const adapter = createCustomAdapter({
        host: "proxy.example.com",
        port: "8080",
        username: "testuser",
        password: "testpass",
      });

      const result = adapter.getEndpoints?.();

      expect(result?.configured).toBe(true);
      expect(result?.endpoints).toHaveLength(1);
      expect(result?.endpoints[0]).toEqual({
        id: "custom-0",
        server: "http://proxy.example.com:8080",
        username: "testuser",
        password: "testpass",
        provider: "custom",
      });
    });
  });

  describe("adapter name", () => {
    it("should have correct name", () => {
      const adapter = createCustomAdapter({});
      expect(adapter.name).toBe("custom");
    });
  });
});
