/**
 * Proxy service that selects and uses the appropriate adapter.
 */

import type { ProxyAdapter, ProxyConfig, ProxyEndpoint } from "./types";
import { builtInAdapters } from "./adapters";
import {
  createRotationService,
  createRotationServiceFromAdapter,
  type RotationService,
  type RotationConfig,
} from "./rotationService";

export interface ProxyServiceConfig {
  /** Custom adapters to use (in addition to built-in ones) */
  customAdapters?: ProxyAdapter[];
  /** Rotation configuration */
  rotation?: RotationConfig;
  /** Log function for debug output */
  log?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface ProxyService {
  /** Whether any proxy adapter is configured */
  isEnabled(): boolean;
  /** Get the active adapter name (or null if no proxy) */
  getActiveAdapterName(): string | null;
  /** Get the proxy configuration (single endpoint, for backwards compat) */
  getProxyConfig(): ProxyConfig | null;
  /** Get browser config for crawl4ai */
  getBrowserConfig(): Record<string, unknown>;
  /** Get all available adapters */
  getAdapters(): ProxyAdapter[];
  /** Get the rotation service (null if no proxy) */
  getRotation(): RotationService | null;
}

/**
 * Create a proxy service that selects the first configured adapter.
 */
export function createProxyService(config: ProxyServiceConfig = {}): ProxyService {
  const log = config.log || (() => {});
  const adapters: ProxyAdapter[] = [
    ...(config.customAdapters || []),
    ...builtInAdapters,
  ];

  let cachedAdapter: ProxyAdapter | null | undefined = undefined;
  let cachedConfig: ProxyConfig | null = null;
  let cachedRotation: RotationService | null = null;

  function findConfiguredAdapter(): ProxyAdapter | null {
    if (cachedAdapter !== undefined) {
      return cachedAdapter;
    }

    for (const adapter of adapters) {
      try {
        if (adapter.isConfigured()) {
          cachedAdapter = adapter;
          log("info", `[pi-crawl4ai] Using proxy adapter: ${adapter.name}`);
          return adapter;
        }
      } catch (error) {
        log("warn", `[pi-crawl4ai] Error checking adapter ${adapter.name}: ${error}`);
      }
    }

    cachedAdapter = null;
    return null;
  }

  function getProxyConfigInternal(): ProxyConfig | null {
    if (cachedConfig !== null || cachedAdapter === null) {
      return cachedConfig;
    }

    const adapter = findConfiguredAdapter();
    if (!adapter) {
      return null;
    }

    try {
      cachedConfig = adapter.getConfig();
      return cachedConfig;
    } catch (error) {
      log("error", `[pi-crawl4ai] Error getting proxy config from ${adapter.name}: ${error}`);
      return null;
    }
  }

  function getRotationInternal(): RotationService | null {
    if (cachedRotation !== null || cachedAdapter === null) {
      return cachedRotation;
    }

    const adapter = findConfiguredAdapter();
    if (!adapter) {
      return null;
    }

    try {
      cachedRotation = createRotationServiceFromAdapter(adapter, {
        ...config.rotation,
        log,
      });
      return cachedRotation;
    } catch (error) {
      log("error", `[pi-crawl4ai] Error creating rotation service: ${error}`);
      return null;
    }
  }

  return {
    isEnabled(): boolean {
      return findConfiguredAdapter() !== null;
    },

    getActiveAdapterName(): string | null {
      const adapter = findConfiguredAdapter();
      return adapter?.name || null;
    },

    getProxyConfig(): ProxyConfig | null {
      return getProxyConfigInternal();
    },

    getBrowserConfig(): Record<string, unknown> {
      // Use rotation if available (supports multiple endpoints)
      const rotation = getRotationInternal();
      if (rotation?.isEnabled()) {
        return rotation.getBrowserConfig();
      }

      // Fallback to single endpoint
      const proxyConfig = getProxyConfigInternal();
      if (!proxyConfig) {
        return {};
      }

      return {
        proxy: {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password,
        },
      };
    },

    getAdapters(): ProxyAdapter[] {
      return adapters;
    },

    getRotation(): RotationService | null {
      return getRotationInternal();
    },
  };
}

// Re-export rotation types
export type { RotationService, RotationConfig } from "./rotationService";
