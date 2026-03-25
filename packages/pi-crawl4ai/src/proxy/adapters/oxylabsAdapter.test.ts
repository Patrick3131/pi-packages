/**
 * Tests for Oxylabs proxy adapter
 */

import { oxylabsAdapter, OXYLABS_USER_ENV, OXYLABS_PASS_ENV, OXYLABS_HOST_ENV, OXYLABS_PORT_ENV, OXYLABS_PORTS_ENV } from "./oxylabsAdapter";
import { resetEnv } from "../../test-utils";

beforeEach(() => {
  resetEnv();
});

describe("oxylabsAdapter", () => {
  describe("isConfigured", () => {
    it("should return false when no env vars are set", () => {
      expect(oxylabsAdapter.isConfigured()).toBe(false);
    });

    it("should return false when only user is set", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      expect(oxylabsAdapter.isConfigured()).toBe(false);
    });

    it("should return false when only password is set", () => {
      process.env[OXYLABS_PASS_ENV] = "testpass";
      expect(oxylabsAdapter.isConfigured()).toBe(false);
    });

    it("should return true when both user and password are set", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";
      expect(oxylabsAdapter.isConfigured()).toBe(true);
    });

    it("should return false when user is empty string", () => {
      process.env[OXYLABS_USER_ENV] = "";
      process.env[OXYLABS_PASS_ENV] = "testpass";
      expect(oxylabsAdapter.isConfigured()).toBe(false);
    });

    it("should return false when password is empty string", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "";
      expect(oxylabsAdapter.isConfigured()).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("should throw when not configured", () => {
      expect(() => oxylabsAdapter.getConfig()).toThrow(
        `Oxylabs requires ${OXYLABS_USER_ENV} and ${OXYLABS_PASS_ENV}`
      );
    });

    it("should return config with default host and port", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";

      const config = oxylabsAdapter.getConfig();

      expect(config.server).toBe("http://isp.oxylabs.io:8001");
      expect(config.username).toBe("user-testuser");
      expect(config.password).toBe("testpass");
      expect(config.adapterName).toBe("oxylabs");
    });

    it("should use custom host", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";
      process.env[OXYLABS_HOST_ENV] = "custom.proxy.io";

      const config = oxylabsAdapter.getConfig();

      expect(config.server).toBe("http://custom.proxy.io:8001");
    });

    it("should use custom single port", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";
      process.env[OXYLABS_PORT_ENV] = "9999";

      const config = oxylabsAdapter.getConfig();

      expect(config.server).toBe("http://isp.oxylabs.io:9999");
    });

    describe("username prefix", () => {
      it("should add user- prefix to username", () => {
        process.env[OXYLABS_USER_ENV] = "myusername";
        process.env[OXYLABS_PASS_ENV] = "testpass";

        const config = oxylabsAdapter.getConfig();

        expect(config.username).toBe("user-myusername");
      });

      it("should not double-prefix if already prefixed", () => {
        process.env[OXYLABS_USER_ENV] = "user-myusername";
        process.env[OXYLABS_PASS_ENV] = "testpass";

        const config = oxylabsAdapter.getConfig();

        expect(config.username).toBe("user-myusername");
      });

      it("should handle usernames with special characters", () => {
        process.env[OXYLABS_USER_ENV] = "user_123";
        process.env[OXYLABS_PASS_ENV] = "testpass";

        const config = oxylabsAdapter.getConfig();

        expect(config.username).toBe("user-user_123");
      });
    });
  });

  describe("getEndpoints", () => {
    // Helper to safely call getEndpoints (it's optional in the interface)
    const getEndpoints = () => {
      if (!oxylabsAdapter.getEndpoints) {
        throw new Error("getEndpoints not implemented");
      }
      return oxylabsAdapter.getEndpoints();
    };

    it("should return empty result when not configured", () => {
      const result = getEndpoints();

      expect(result.configured).toBe(false);
      expect(result.endpoints).toEqual([]);
    });

    it("should return default 10 endpoints", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";

      const result = getEndpoints();

      expect(result.configured).toBe(true);
      expect(result.endpoints).toHaveLength(10);
    });

    it("should return endpoints with correct port range", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";

      const result = getEndpoints();
      const ports = result.endpoints.map((e) => e.metadata?.port);

      expect(ports).toEqual([8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010]);
    });

    it("should return endpoints with correct IDs", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";

      const result = getEndpoints();

      expect(result.endpoints[0].id).toBe("oxylabs-8001");
      expect(result.endpoints[9].id).toBe("oxylabs-8010");
    });

    it("should return endpoints with correct server URLs", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";

      const result = getEndpoints();

      expect(result.endpoints[0].server).toBe("http://isp.oxylabs.io:8001");
      expect(result.endpoints[5].server).toBe("http://isp.oxylabs.io:8006");
    });

    it("should use custom host for all endpoints", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";
      process.env[OXYLABS_HOST_ENV] = "custom.proxy.io";

      const result = getEndpoints();

      for (const endpoint of result.endpoints) {
        expect(endpoint.server).toContain("custom.proxy.io");
      }
    });

    describe("OXYLABS_PORTS parsing", () => {
      it("should parse comma-separated ports", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORTS_ENV] = "9001,9002,9003";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(3);
        expect(result.endpoints[0].server).toBe("http://isp.oxylabs.io:9001");
        expect(result.endpoints[2].server).toBe("http://isp.oxylabs.io:9003");
      });

      it("should parse ports with spaces", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORTS_ENV] = " 9001 , 9002 , 9003 ";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(3);
      });

      it("should filter out invalid ports (non-numeric)", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORTS_ENV] = "9001,invalid,9003";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(2);
        expect(result.endpoints[0].metadata?.port).toBe(9001);
        expect(result.endpoints[1].metadata?.port).toBe(9003);
      });

      it("should filter out ports outside valid range", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORTS_ENV] = "9001,-1,99999,0";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(1);
        expect(result.endpoints[0].metadata?.port).toBe(9001);
      });

      it("should fall back to defaults when all ports invalid", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORTS_ENV] = "invalid,also-invalid";

        const result = getEndpoints();

        // Should fall back to default 10 ports
        expect(result.endpoints).toHaveLength(10);
      });

      it("should fall back to defaults when OXYLABS_PORTS is empty", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORTS_ENV] = "";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(10);
      });
    });

    describe("OXYLABS_PORT (single port)", () => {
      it("should return single endpoint when OXYLABS_PORT is set", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORT_ENV] = "7777";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(1);
        expect(result.endpoints[0].server).toBe("http://isp.oxylabs.io:7777");
      });
    });

    describe("OXYLABS_PORTS priority over OXYLABS_PORT", () => {
      it("should prefer OXYLABS_PORTS over OXYLABS_PORT", () => {
        process.env[OXYLABS_USER_ENV] = "testuser";
        process.env[OXYLABS_PASS_ENV] = "testpass";
        process.env[OXYLABS_PORT_ENV] = "7777";
        process.env[OXYLABS_PORTS_ENV] = "9001,9002";

        const result = getEndpoints();

        expect(result.endpoints).toHaveLength(2);
        expect(result.endpoints[0].metadata?.port).toBe(9001);
      });
    });

    it("should include correct metadata in endpoints", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";
      process.env[OXYLABS_PORTS_ENV] = "8001,8002";

      const result = getEndpoints();

      expect(result.endpoints[0].metadata).toEqual({ port: 8001, index: 0 });
      expect(result.endpoints[1].metadata).toEqual({ port: 8002, index: 1 });
    });

    it("should include prefixed username in all endpoints", () => {
      process.env[OXYLABS_USER_ENV] = "testuser";
      process.env[OXYLABS_PASS_ENV] = "testpass";

      const result = getEndpoints();

      for (const endpoint of result.endpoints) {
        expect(endpoint.username).toBe("user-testuser");
      }
    });
  });
});
