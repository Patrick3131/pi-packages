/**
 * Custom proxy adapter that uses provided configuration.
 * Used when proxy is configured via JSON config file.
 */

import type { ProxyAdapter, ProxyConfig, ProxyEndpoint, ProxyEndpointsResult } from "../types";

export interface CustomProxySettings {
  /** Full proxy URL with auth */
  url?: string;
  /** Proxy host */
  host?: string;
  /** Proxy port */
  port?: string;
  /** Username */
  username?: string;
  /** Password */
  password?: string;
  /** Pre-built endpoints for rotation */
  endpoints?: ProxyEndpoint[];
}

/**
 * Create a custom proxy adapter with the given settings.
 */
export function createCustomAdapter(settings: CustomProxySettings): ProxyAdapter {
  return {
    name: "custom",

    isConfigured(): boolean {
      if (settings.url) return true;
      if (settings.host && settings.port) return true;
      if (settings.endpoints && settings.endpoints.length > 0) return true;
      return false;
    },

    getConfig(): ProxyConfig {
      if (settings.url) {
        try {
          const parsed = new URL(settings.url);
          return {
            server: `${parsed.protocol}//${parsed.host}`,
            username: parsed.username || undefined,
            password: parsed.password || undefined,
            adapterName: this.name,
          };
        } catch (error) {
          throw new Error(
            `Invalid proxy URL: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (settings.endpoints && settings.endpoints.length > 0) {
        // Return first endpoint
        const first = settings.endpoints[0];
        return {
          server: first.server,
          username: first.username,
          password: first.password,
          adapterName: this.name,
        };
      }

      if (settings.host && settings.port) {
        return {
          server: `http://${settings.host}:${settings.port}`,
          username: settings.username,
          password: settings.password,
          adapterName: this.name,
        };
      }

      throw new Error("Custom proxy requires either url, endpoints, or host+port");
    },

    getEndpoints(): ProxyEndpointsResult {
      // Use pre-built endpoints if provided
      if (settings.endpoints && settings.endpoints.length > 0) {
        return { configured: true, endpoints: settings.endpoints };
      }

      // Otherwise return single endpoint from getConfig
      if (!this.isConfigured()) {
        return { configured: false, endpoints: [] };
      }

      const config = this.getConfig();
      return {
        configured: true,
        endpoints: [
          {
            id: "custom-0",
            server: config.server,
            username: config.username,
            password: config.password,
            provider: this.name,
          },
        ],
      };
    },
  };
}
