/**
 * Configuration loading from JSON file or environment variables.
 * Priority: JSON config > Environment variables > Defaults
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Load .env file from project directory into process.env.
 * Simple implementation that doesn't require dotenv dependency.
 */
function loadEnvFile(cwd?: string): void {
  const envPath = join(cwd || process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined (shell env takes priority)
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn(
      `[pi-crawl4ai] Failed to load .env file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export interface Crawl4AIJsonConfig {
  /** crawl4ai API base URL */
  url?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Whether the crawl tool is enabled by default at startup (default: false) */
  enabledByDefault?: boolean;
  /** Proxy configuration */
  proxy?: {
    /** Full proxy URL with auth (e.g., http://user:pass@host:port) */
    url?: string;
    /** Or use provider-specific config */
    provider?: "oxylabs" | "custom";
    /** Host */
    host?: string;
    /** Single port (number or string) */
    port?: string | number;
    /** Multiple ports for rotation (comma-separated or array) */
    ports?: string | number[];
    /** Username */
    username?: string;
    /** Password */
    password?: string;
  };
}

export interface ResolvedConfig {
  baseUrl: string;
  timeout: number;
  /** Whether the crawl tool is enabled by default at startup */
  enabledByDefault: boolean;
  proxyUrl?: string;
  proxyProvider?: string;
  proxyHost?: string;
  proxyPort?: string;
  proxyPorts?: number[];
  proxyUsername?: string;
  proxyPassword?: string;
}

const CONFIG_FILENAMES = ["crawl4ai.json", ".crawl4ai.json"];

/**
 * Find and load JSON config file.
 * Searches in order:
 * 1. Project directory (cwd)
 * 2. .pi/ directory in project
 * 3. ~/.pi/agent/extensions/ (global)
 */
export function findConfigFile(cwd?: string): string | null {
  const searchDirs = [
    cwd || process.cwd(),
    join(cwd || process.cwd(), ".pi"),
    join(homedir(), ".pi", "agent", "extensions"),
  ];

  for (const dir of searchDirs) {
    for (const filename of CONFIG_FILENAMES) {
      const filepath = join(dir, filename);
      if (existsSync(filepath)) {
        return filepath;
      }
    }
  }

  return null;
}

/**
 * Load JSON config from file.
 */
export function loadJsonConfig(filepath: string): Crawl4AIJsonConfig | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content) as Crawl4AIJsonConfig;
  } catch (error) {
    console.warn(
      `[pi-crawl4ai] Failed to load config from ${filepath}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Resolve environment variable references in a string.
 * Supports ${VAR_NAME} syntax.
 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || "";
  });
}

/**
 * Merge JSON config with environment variables.
 * JSON config takes priority over env vars.
 * Supports ${ENV_VAR} substitution in JSON string values.
 */
export function mergeConfigWithEnv(jsonConfig: Crawl4AIJsonConfig | null): ResolvedConfig {
  const config: ResolvedConfig = {
    baseUrl: jsonConfig?.url ? resolveEnvVars(jsonConfig.url) : process.env.CRAWL4AI_BASE_URL || "http://localhost:11235",
    timeout: jsonConfig?.timeoutMs || parseInt(process.env.CRAWL4AI_TIMEOUT || "60000", 10),
    enabledByDefault: jsonConfig?.enabledByDefault ?? false,
  };

  // Proxy from JSON config
  if (jsonConfig?.proxy) {
    if (jsonConfig.proxy.url) {
      config.proxyUrl = resolveEnvVars(jsonConfig.proxy.url);
    } else if (jsonConfig.proxy.provider === "oxylabs" || jsonConfig.proxy.username) {
      config.proxyProvider = jsonConfig.proxy.provider || "oxylabs";
      config.proxyHost = jsonConfig.proxy.host ? resolveEnvVars(jsonConfig.proxy.host) : undefined;
      config.proxyPort = typeof jsonConfig.proxy.port === "number"
        ? String(jsonConfig.proxy.port)
        : jsonConfig.proxy.port;

      // Parse multiple ports for rotation
      if (jsonConfig.proxy.ports) {
        if (Array.isArray(jsonConfig.proxy.ports)) {
          config.proxyPorts = jsonConfig.proxy.ports;
        } else if (typeof jsonConfig.proxy.ports === "string") {
          config.proxyPorts = jsonConfig.proxy.ports
            .split(",")
            .map((p) => parseInt(p.trim(), 10))
            .filter((p) => !isNaN(p));
        }
      }

      // Support ${ENV_VAR} substitution for username/password
      // Fall back to env vars if not provided in JSON
      config.proxyUsername = jsonConfig.proxy.username
        ? resolveEnvVars(jsonConfig.proxy.username)
        : process.env.OXYLABS_USER;
      config.proxyPassword = jsonConfig.proxy.password
        ? resolveEnvVars(jsonConfig.proxy.password)
        : process.env.OXYLABS_PASS;
    }
  }

  // Proxy from env vars (fallback)
  if (!config.proxyUrl && !config.proxyUsername) {
    config.proxyUrl = process.env.CRAWL4AI_PROXY_URL;

    if (!config.proxyUrl) {
      const oxylabsUser = process.env.OXYLABS_USER;
      const oxylabsPass = process.env.OXYLABS_PASS;

      if (oxylabsUser && oxylabsPass) {
        config.proxyProvider = "oxylabs";
        config.proxyHost = process.env.OXYLABS_HOST || "isp.oxylabs.io";
        config.proxyPort = process.env.OXYLABS_PORT;

        // Parse multiple ports from OXYLABS_PORTS
        if (process.env.OXYLABS_PORTS) {
          config.proxyPorts = process.env.OXYLABS_PORTS
            .split(",")
            .map((p) => parseInt(p.trim(), 10))
            .filter((p) => !isNaN(p));
        }

        config.proxyUsername = oxylabsUser;
        config.proxyPassword = oxylabsPass;
      }
    }
  }

  return config;
}

/**
 * Load configuration from JSON file and/or environment variables.
 */
export function loadConfig(cwd?: string): ResolvedConfig {
  // Load .env file first (shell env vars take priority)
  loadEnvFile(cwd);

  const configPath = findConfigFile(cwd);
  const jsonConfig = configPath ? loadJsonConfig(configPath) : null;

  if (configPath && jsonConfig) {
    console.log(`[pi-crawl4ai] Loaded config from ${configPath}`);
  }

  return mergeConfigWithEnv(jsonConfig);
}
