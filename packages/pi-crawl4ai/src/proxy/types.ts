/**
 * Proxy adapter types and interfaces.
 */

/**
 * A single proxy endpoint with its configuration.
 */
export interface ProxyEndpoint {
  /** Unique identifier for this endpoint */
  id: string;
  /** Proxy server URL (e.g., http://proxy.example.com:8080) */
  server: string;
  /** Optional username for authentication */
  username?: string;
  /** Optional password for authentication */
  password?: string;
  /** Provider/adapter name */
  provider: string;
  /** Optional metadata (e.g., port number, region) */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration returned by a proxy adapter.
 */
export interface ProxyConfig {
  /** Proxy server URL (e.g., http://proxy.example.com:8080) */
  server: string;
  /** Optional username for authentication */
  username?: string;
  /** Optional password for authentication */
  password?: string;
  /** Adapter name for logging/debugging */
  adapterName: string;
}

/**
 * Result from getEndpoints() - can be single or multiple endpoints.
 */
export interface ProxyEndpointsResult {
  /** Whether the adapter is configured */
  configured: boolean;
  /** Available endpoints (empty if not configured) */
  endpoints: ProxyEndpoint[];
}

/**
 * Adapter for a specific proxy provider.
 * Implement this interface to add support for a new proxy provider.
 */
export interface ProxyAdapter {
  /** Unique name for this adapter (used in logs) */
  readonly name: string;

  /**
   * Check if this adapter is properly configured.
   * Should return true only if all required env vars are set.
   */
  isConfigured(): boolean;

  /**
   * Get the proxy configuration (single endpoint, for backwards compat).
   * Only called if isConfigured() returns true.
   */
  getConfig(): ProxyConfig;

  /**
   * Get all available proxy endpoints (for rotation).
   * Only called if isConfigured() returns true.
   * Default implementation returns single endpoint from getConfig().
   */
  getEndpoints?(): ProxyEndpointsResult;
}
