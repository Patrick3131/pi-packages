import { loadEnvFile, resolveEnvVars, resolveNumber } from "./env";
import { findConfigFile, loadJsonConfig } from "./files";
import { resolveAuthProfiles } from "./authProfiles";
import { applyEnvProxyConfig, applyJsonProxyConfig } from "./proxyResolution";
import type { Crawl4AIJsonConfig, ResolvedConfig } from "./types";

export { findConfigFile, loadJsonConfig } from "./files";
export type {
  AuthCookie,
  AuthProfileConfig,
  Crawl4AIJsonConfig,
  ProxySettingsConfig,
  ResolvedAuthProfile,
  ResolvedConfig,
  ResolvedProxySettings,
} from "./types";

export function mergeConfigWithEnv(jsonConfig: Crawl4AIJsonConfig | null): ResolvedConfig {
  const config: ResolvedConfig = {
    baseUrl: jsonConfig?.url ? resolveEnvVars(jsonConfig.url) : process.env.CRAWL4AI_BASE_URL || "http://localhost:11235",
    timeout: jsonConfig?.timeoutMs || parseInt(process.env.CRAWL4AI_TIMEOUT || "60000", 10),
    enabledByDefault: jsonConfig?.enabledByDefault ?? false,
    backoffMs: jsonConfig?.backoffMs !== undefined ? resolveNumber(jsonConfig.backoffMs) : undefined,
    authProfiles: resolveAuthProfiles(jsonConfig?.authProfiles),
  };

  applyJsonProxyConfig(config, jsonConfig);
  applyEnvProxyConfig(config);
  return config;
}

export function loadConfig(cwd?: string): ResolvedConfig {
  loadEnvFile(cwd);
  const configPath = findConfigFile(cwd);
  const jsonConfig = configPath ? loadJsonConfig(configPath) : null;
  if (configPath && jsonConfig) {
    console.log(`[pi-crawl4ai] Loaded config from ${configPath}`);
  }
  return mergeConfigWithEnv(jsonConfig);
}
