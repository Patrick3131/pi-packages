/**
 * Tests for generic proxy adapter
 */

import { genericAdapter, GENERIC_PROXY_URL_ENV } from "./genericAdapter";
import { resetEnv } from "../../test-utils";

beforeEach(() => {
  resetEnv();
});

describe("genericAdapter", () => {
  describe("isConfigured", () => {
    it("should return false when env var is not set", () => {
      expect(genericAdapter.isConfigured()).toBe(false);
    });

    it("should return false when env var is empty string", () => {
      process.env[GENERIC_PROXY_URL_ENV] = "";
      expect(genericAdapter.isConfigured()).toBe(false);
    });

    it("should return true when env var is set", () => {
      process.env[GENERIC_PROXY_URL_ENV] = "http://proxy.example.com:8080";
      expect(genericAdapter.isConfigured()).toBe(true);
    });
  });

  describe("getConfig", () => {
    it("should throw when not configured", () => {
      expect(() => genericAdapter.getConfig()).toThrow(
        `${GENERIC_PROXY_URL_ENV} is not set`
      );
    });

    describe("URL parsing", () => {
      it("should parse URL with auth", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://user:pass@proxy.example.com:8080";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:8080");
        expect(config.username).toBe("user");
        expect(config.password).toBe("pass");
        expect(config.adapterName).toBe("generic");
      });

      it("should parse URL without auth", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://proxy.example.com:8080";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:8080");
        expect(config.username).toBeUndefined();
        expect(config.password).toBeUndefined();
      });

      it("should parse URL with URL-encoded credentials", () => {
        // URL class keeps the encoded values, consumer must decode
        process.env[GENERIC_PROXY_URL_ENV] = "http://user%40email:p%40ssw0rd@proxy.example.com:8080";

        const config = genericAdapter.getConfig();

        expect(config.username).toBe("user%40email");
        expect(config.password).toBe("p%40ssw0rd");
      });

      it("should parse URL with username only (no password)", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://user@proxy.example.com:8080";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:8080");
        expect(config.username).toBe("user");
        // Empty password is converted to undefined
        expect(config.password).toBeUndefined();
      });

      it("should parse HTTPS URL", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "https://user:pass@proxy.example.com:8443";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("https://proxy.example.com:8443");
      });

      it("should parse URL with IP address", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://user:pass@192.168.1.1:8080";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("http://192.168.1.1:8080");
      });

      it("should parse URL with custom port", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://proxy.example.com:9999";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com:9999");
      });

      it("should parse URL without port (uses default)", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://proxy.example.com";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("http://proxy.example.com");
      });

      it("should parse SOCKS5 URL", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "socks5://user:pass@proxy.example.com:1080";

        const config = genericAdapter.getConfig();

        expect(config.server).toBe("socks5://proxy.example.com:1080");
        expect(config.username).toBe("user");
        expect(config.password).toBe("pass");
      });
    });

    describe("invalid URLs", () => {
      it("should throw for invalid URL format", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "not-a-valid-url";

        expect(() => genericAdapter.getConfig()).toThrow(
          `Invalid ${GENERIC_PROXY_URL_ENV}`
        );
      });

      it("should throw for malformed host", () => {
        process.env[GENERIC_PROXY_URL_ENV] = "http://";

        expect(() => genericAdapter.getConfig()).toThrow();
      });
    });
  });

  describe("adapter name", () => {
    it("should have correct name", () => {
      expect(genericAdapter.name).toBe("generic");
    });
  });
});
