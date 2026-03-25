/**
 * Tests for rotation service
 */

import { createRotationService, createRotationServiceFromAdapter } from "./rotationService";
import type { ProxyEndpoint, ProxyAdapter } from "./types";

describe("createRotationService", () => {
  const createTestEndpoints = (count: number): ProxyEndpoint[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `endpoint-${i}`,
      server: `http://proxy${i}.example.com:8080`,
      username: `user${i}`,
      password: `pass${i}`,
      provider: "test",
      metadata: { index: i },
    }));
  };

  describe("with no endpoints", () => {
    it("should return disabled service", () => {
      const service = createRotationService([]);

      expect(service.isEnabled()).toBe(false);
      expect(service.getEndpointCount()).toBe(0);
      expect(service.getNextEndpoint()).toBeNull();
      expect(service.getBrowserConfig()).toEqual({});
    });
  });

  describe("with single endpoint", () => {
    let service: ReturnType<typeof createRotationService>;
    const endpoints = createTestEndpoints(1);

    beforeEach(() => {
      service = createRotationService(endpoints);
    });

    it("should be enabled", () => {
      expect(service.isEnabled()).toBe(true);
      expect(service.getEndpointCount()).toBe(1);
    });

    it("should return the single endpoint", () => {
      const endpoint = service.getNextEndpoint();
      expect(endpoint).toEqual(endpoints[0]);
    });

    it("should return browser config with proxy", () => {
      const config = service.getBrowserConfig();
      expect(config).toHaveProperty("proxy");
      expect(config.proxy).toEqual({
        server: "http://proxy0.example.com:8080",
        username: "user0",
        password: "pass0",
      });
    });
  });

  describe("with multiple endpoints", () => {
    let service: ReturnType<typeof createRotationService>;
    const endpoints = createTestEndpoints(5);

    beforeEach(() => {
      service = createRotationService(endpoints);
    });

    it("should rotate through endpoints", () => {
      const first = service.getNextEndpoint();
      const second = service.getNextEndpoint();
      const third = service.getNextEndpoint();

      // Should be different (rotation)
      expect(first?.id).not.toBe(second?.id);
      expect(second?.id).not.toBe(third?.id);
    });

    it("should cycle back to first endpoint after all are used", () => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const endpoint = service.getNextEndpoint();
        if (endpoint) ids.push(endpoint.id);
      }

      // After 5 endpoints, should cycle back
      expect(ids[0]).toBe(ids[5]);
    });

    it("should return all endpoints", () => {
      const all = service.getEndpoints();
      expect(all).toHaveLength(5);
      expect(all).toEqual(endpoints);
    });

    it("should get endpoint by id", () => {
      const endpoint = service.getEndpoint("endpoint-2");
      expect(endpoint).toEqual(endpoints[2]);
    });

    it("should return undefined for unknown id", () => {
      const endpoint = service.getEndpoint("unknown");
      expect(endpoint).toBeUndefined();
    });
  });

  describe("quarantine", () => {
    let service: ReturnType<typeof createRotationService>;
    const endpoints = createTestEndpoints(3);

    beforeEach(() => {
      service = createRotationService(endpoints, { quarantineTtlMs: 1000 });
    });

    it("should not quarantine by default", () => {
      expect(service.isQuarantined("endpoint-0")).toBe(false);
    });

    it("should quarantine endpoint", () => {
      service.quarantine("endpoint-0", "test reason");
      expect(service.isQuarantined("endpoint-0")).toBe(true);
    });

    it("should skip quarantined endpoints", () => {
      service.quarantine("endpoint-0");
      service.quarantine("endpoint-1");

      // Only endpoint-2 should be available
      const endpoint = service.getNextEndpoint();
      expect(endpoint?.id).toBe("endpoint-2");
    });

    it("should return null when all endpoints quarantined", () => {
      service.quarantine("endpoint-0");
      service.quarantine("endpoint-1");
      service.quarantine("endpoint-2");

      expect(service.getNextEndpoint()).toBeNull();
      expect(service.getBrowserConfig()).toEqual({});
    });
  });

  describe("sessions", () => {
    let service: ReturnType<typeof createRotationService>;
    const endpoints = createTestEndpoints(3);

    beforeEach(() => {
      service = createRotationService(endpoints, {
        sessionMaxRequests: 3,
        sessionTtlMs: 1000,
      });
    });

    it("should create session on first request", () => {
      const endpoint = service.getSession("session-1");
      expect(endpoint).toBeDefined();
    });

    it("should return same endpoint for same session", () => {
      const first = service.getSession("session-1");
      service.incrementSession("session-1");
      const second = service.getSession("session-1");

      expect(first?.id).toBe(second?.id);
    });

    it("should rotate after max requests", () => {
      const first = service.getSession("session-1");

      // Increment to max
      service.incrementSession("session-1");
      service.incrementSession("session-1");
      service.incrementSession("session-1");

      // Next call should rotate
      const second = service.getSession("session-1");
      expect(second?.id).not.toBe(first?.id);
    });

    it("should handle multiple sessions independently", () => {
      const session1 = service.getSession("session-1");
      const session2 = service.getSession("session-2");

      // Different sessions may have different endpoints
      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
    });

    it("should invalidate session", () => {
      service.getSession("session-1");
      service.invalidateSession("session-1");

      // New session with same ID should get new endpoint
      const endpoint = service.getSession("session-1");
      expect(endpoint).toBeDefined();
    });
  });

  describe("getBrowserConfigForEndpoint", () => {
    it("should return proxy config for specific endpoint", () => {
      const service = createRotationService(createTestEndpoints(1));
      const endpoint = createTestEndpoints(1)[0];

      const config = service.getBrowserConfigForEndpoint(endpoint);

      expect(config).toEqual({
        proxy: {
          server: "http://proxy0.example.com:8080",
          username: "user0",
          password: "pass0",
        },
      });
    });
  });
});

describe("createRotationServiceFromAdapter", () => {
  const createMockAdapter = (
    configured: boolean,
    endpoints?: ProxyEndpoint[]
  ): ProxyAdapter => ({
    name: "mock",
    isConfigured: () => configured,
    getConfig: () => ({
      server: "http://mock:8080",
      username: "mockuser",
      password: "mockpass",
      adapterName: "mock",
    }),
    getEndpoints: endpoints
      ? () => ({ configured, endpoints })
      : undefined,
  });

  it("should return disabled service for unconfigured adapter", () => {
    const adapter = createMockAdapter(false);
    const service = createRotationServiceFromAdapter(adapter);

    expect(service.isEnabled()).toBe(false);
  });

  it("should use getEndpoints if available", () => {
    const endpoints: ProxyEndpoint[] = [
      { id: "1", server: "http://a:8080", provider: "mock" },
      { id: "2", server: "http://b:8080", provider: "mock" },
    ];

    const adapter = createMockAdapter(true, endpoints);
    const service = createRotationServiceFromAdapter(adapter);

    expect(service.isEnabled()).toBe(true);
    expect(service.getEndpointCount()).toBe(2);
  });

  it("should fall back to getConfig for single endpoint", () => {
    const adapter: ProxyAdapter = {
      name: "mock",
      isConfigured: () => true,
      getConfig: () => ({
        server: "http://single:8080",
        username: "user",
        password: "pass",
        adapterName: "mock",
      }),
    };

    const service = createRotationServiceFromAdapter(adapter);

    expect(service.isEnabled()).toBe(true);
    expect(service.getEndpointCount()).toBe(1);
    expect(service.getNextEndpoint()?.server).toBe("http://single:8080");
  });
});
