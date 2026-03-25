/**
 * Configuration for pi-crawl4ai extension.
 * All values are read from environment variables.
 */

export interface Crawl4AIConfig {
  /** Base URL for crawl4ai Docker API (default: http://localhost:11235) */
  baseUrl: string;
  /** Optional proxy configuration */
  proxy?: {
    /** Proxy server URL (e.g., http://proxy.example.com:8080) */
    server: string;
    /** Optional username for proxy auth */
    username?: string;
    /** Optional password for proxy auth */
    password?: string;
  };
  /** Request timeout in milliseconds (default: 60000) */
  timeout: number;
  /** Whether proxy is enabled */
  proxyEnabled: boolean;
}

/**
 * Load configuration from environment variables.
 */
export function loadConfig(): Crawl4AIConfig {
  const baseUrl = process.env.CRAWL4AI_BASE_URL || "http://localhost:11235";
  const timeout = parseInt(process.env.CRAWL4AI_TIMEOUT || "60000", 10);

  // Proxy configuration - supports multiple formats
  const proxyUrl = process.env.CRAWL4AI_PROXY_URL;
  const oxylabsUser = process.env.OXYLABS_USER;
  const oxylabsPass = process.env.OXYLABS_PASS;
  const oxylabsHost = process.env.OXYLABS_HOST || "pr.oxylabs.io";
  const oxylabsPort = process.env.OXYLABS_PORT || "7777";

  let proxy: Crawl4AIConfig["proxy"] | undefined;
  let proxyEnabled = false;

  // Option 1: Direct proxy URL (e.g., http://user:pass@host:port)
  if (proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      proxy = {
        server: `${url.protocol}//${url.host}`,
        username: url.username || undefined,
        password: url.password || undefined,
      };
      proxyEnabled = true;
    } catch {
      console.warn("[pi-crawl4ai] Invalid CRAWL4AI_PROXY_URL, ignoring");
    }
  }
  // Option 2: Oxylabs ISP proxy (auto-configured)
  else if (oxylabsUser && oxylabsPass) {
    proxy = {
      server: `http://${oxylabsHost}:${oxylabsPort}`,
      username: oxylabsUser.startsWith("user-") ? oxylabsUser : `user-${oxylabsUser}`,
      password: oxylabsPass,
    };
    proxyEnabled = true;
  }

  return {
    baseUrl,
    proxy,
    timeout,
    proxyEnabled,
  };
}

/**
 * Build browser config for crawl4ai with optional proxy.
 */
export function buildBrowserConfig(config: Crawl4AIConfig): Record<string, unknown> {
  const browserConfig: Record<string, unknown> = {};

  if (config.proxyEnabled && config.proxy) {
    browserConfig.proxy = {
      server: config.proxy.server,
      username: config.proxy.username,
      password: config.proxy.password,
    };
  }

  return browserConfig;
}
