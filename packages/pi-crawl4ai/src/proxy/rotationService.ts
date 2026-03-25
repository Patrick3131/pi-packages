/**
 * Proxy rotation service with round-robin, sessions, and quarantine.
 */

import type { ProxyEndpoint, ProxyAdapter } from "./types";

export interface RotationConfig {
  /** Maximum requests per session before rotating */
  sessionMaxRequests?: number;
  /** Session TTL in milliseconds */
  sessionTtlMs?: number;
  /** Quarantine TTL in milliseconds */
  quarantineTtlMs?: number;
  /** Log function */
  log?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface RotationState {
  /** Current endpoint index */
  currentIndex: number;
  /** Active sessions */
  sessions: Map<string, ProxySession>;
  /** Quarantined endpoints with expiry times */
  quarantine: Map<string, number>;
}

interface ProxySession {
  endpoint: ProxyEndpoint;
  requestCount: number;
  maxRequests: number;
  expiresAt: number;
}

export interface RotationService {
  /** Whether rotation is enabled (has multiple endpoints) */
  isEnabled(): boolean;
  /** Get number of available endpoints */
  getEndpointCount(): number;
  /** Get next available endpoint (skips quarantined) */
  getNextEndpoint(): ProxyEndpoint | null;
  /** Get endpoint by ID */
  getEndpoint(id: string): ProxyEndpoint | undefined;
  /** Get all endpoints */
  getEndpoints(): ProxyEndpoint[];
  /** Quarantine an endpoint */
  quarantine(endpointId: string, reason?: string): void;
  /** Check if endpoint is quarantined */
  isQuarantined(endpointId: string): boolean;
  /** Get or create session (sticky endpoint) */
  getSession(sessionId: string): ProxyEndpoint | null;
  /** Increment session request count */
  incrementSession(sessionId: string): void;
  /** Invalidate session */
  invalidateSession(sessionId: string): void;
  /** Get browser config for crawl4ai using next endpoint */
  getBrowserConfig(): Record<string, unknown>;
  /** Get browser config for specific endpoint */
  getBrowserConfigForEndpoint(endpoint: ProxyEndpoint): Record<string, unknown>;
}

/**
 * Create a rotation service from a list of endpoints.
 */
export function createRotationService(
  endpoints: ProxyEndpoint[],
  config: RotationConfig = {}
): RotationService {
  const log = config.log || (() => {});
  const sessionMaxRequests = config.sessionMaxRequests || 15;
  const sessionTtlMs = config.sessionTtlMs || 60000;
  const quarantineTtlMs = config.quarantineTtlMs || 300000; // 5 min default

  const state: RotationState = {
    currentIndex: Math.floor(Math.random() * endpoints.length),
    sessions: new Map(),
    quarantine: new Map(),
  };

  function purgeExpiredQuarantine(): void {
    const now = Date.now();
    for (const [id, expiry] of state.quarantine.entries()) {
      if (expiry <= now) {
        state.quarantine.delete(id);
      }
    }
  }

  function isEnabled(): boolean {
    return endpoints.length > 0;
  }

  function getEndpointCount(): number {
    return endpoints.length;
  }

  function getEndpoints(): ProxyEndpoint[] {
    return endpoints;
  }

  function getEndpoint(id: string): ProxyEndpoint | undefined {
    return endpoints.find((e) => e.id === id);
  }

  function getNextEndpoint(): ProxyEndpoint | null {
    if (endpoints.length === 0) return null;

    purgeExpiredQuarantine();

    // Try each endpoint once
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[state.currentIndex % endpoints.length];
      state.currentIndex = (state.currentIndex + 1) % endpoints.length;

      if (!state.quarantine.has(endpoint.id)) {
        return endpoint;
      }
    }

    // All endpoints quarantined, return null
    log("warn", "All proxy endpoints are quarantined");
    return null;
  }

  function quarantine(endpointId: string, reason?: string): void {
    state.quarantine.set(endpointId, Date.now() + quarantineTtlMs);
    log(
      "warn",
      `[proxy-rotation] Quarantined ${endpointId} for ${quarantineTtlMs}ms${reason ? ` (${reason})` : ""}`
    );
  }

  function isQuarantined(endpointId: string): boolean {
    purgeExpiredQuarantine();
    const expiry = state.quarantine.get(endpointId);
    return typeof expiry === "number" && expiry > Date.now();
  }

  function getSession(sessionId: string): ProxyEndpoint | null {
    const now = Date.now();
    const existing = state.sessions.get(sessionId);

    if (existing) {
      // Check if session expired
      if (existing.expiresAt <= now) {
        log("info", `[proxy-rotation] Session "${sessionId}" expired`);
        state.sessions.delete(sessionId);
      } else if (existing.requestCount >= existing.maxRequests) {
        log(
          "info",
          `[proxy-rotation] Session "${sessionId}" hit request limit, rotating`
        );
        state.sessions.delete(sessionId);
      } else {
        // Refresh TTL
        existing.expiresAt = now + sessionTtlMs;
        return existing.endpoint;
      }
    }

    // Create new session
    const endpoint = getNextEndpoint();
    if (!endpoint) return null;

    state.sessions.set(sessionId, {
      endpoint,
      requestCount: 0,
      maxRequests: sessionMaxRequests,
      expiresAt: now + sessionTtlMs,
    });

    log(
      "info",
      `[proxy-rotation] Created session "${sessionId}" on ${endpoint.id}`
    );

    return endpoint;
  }

  function incrementSession(sessionId: string): void {
    const session = state.sessions.get(sessionId);
    if (session) {
      session.requestCount++;
    }
  }

  function invalidateSession(sessionId: string): void {
    state.sessions.delete(sessionId);
    log("info", `[proxy-rotation] Invalidated session "${sessionId}"`);
  }

  function getBrowserConfig(): Record<string, unknown> {
    const endpoint = getNextEndpoint();
    if (!endpoint) return {};

    return getBrowserConfigForEndpoint(endpoint);
  }

  function getBrowserConfigForEndpoint(endpoint: ProxyEndpoint): Record<string, unknown> {
    return {
      proxy: {
        server: endpoint.server,
        username: endpoint.username,
        password: endpoint.password,
      },
    };
  }

  return {
    isEnabled,
    getEndpointCount,
    getNextEndpoint,
    getEndpoint,
    getEndpoints,
    quarantine,
    isQuarantined,
    getSession,
    incrementSession,
    invalidateSession,
    getBrowserConfig,
    getBrowserConfigForEndpoint,
  };
}

/**
 * Create a rotation service from an adapter.
 * Uses adapter.getEndpoints() if available, otherwise falls back to single endpoint.
 */
export function createRotationServiceFromAdapter(
  adapter: ProxyAdapter,
  config: RotationConfig = {}
): RotationService {
  let endpoints: ProxyEndpoint[];

  if (adapter.getEndpoints) {
    const result = adapter.getEndpoints();
    if (!result.configured || result.endpoints.length === 0) {
      // Return empty service
      return createRotationService([], config);
    }
    endpoints = result.endpoints;
  } else if (adapter.isConfigured()) {
    // Fallback to single endpoint
    const proxyConfig = adapter.getConfig();
    endpoints = [
      {
        id: `${adapter.name}-0`,
        server: proxyConfig.server,
        username: proxyConfig.username,
        password: proxyConfig.password,
        provider: proxyConfig.adapterName,
      },
    ];
  } else {
    // Not configured
    return createRotationService([], config);
  }

  return createRotationService(endpoints, config);
}
