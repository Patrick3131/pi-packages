import { loadEnvFile, resolveEnvVars, resolveNumber } from "./env";
import { findConfigFile, loadJsonConfig } from "./files";
import type {
  Crawl4AIJsonConfig,
  ResolvedConfig,
  ResolvedRetention,
  RetentionSettings,
} from "./types";

export { findConfigFile, loadJsonConfig } from "./files";
export type {
  Crawl4AIJsonConfig,
  ResolvedConfig,
  ResolvedRetention,
  RetentionSettings,
} from "./types";

const DEFAULT_RETENTION: ResolvedRetention = {
  enabled: true,
  maxSessions: 20,
  maxAgeDays: 7,
  maxTotalMb: 512,
};

const DEFAULT_OUTPUT_DIR = "./output-crawl4ai";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveRetention(jsonConfig: Crawl4AIJsonConfig | null): ResolvedRetention {
  const fromJson: RetentionSettings = jsonConfig?.retention ?? {};
  return {
    enabled:
      fromJson.enabled ??
      parseBoolean(process.env.CRAWL4AI_RETENTION_ENABLED, DEFAULT_RETENTION.enabled),
    maxSessions:
      resolveNumber(fromJson.maxSessions) ??
      resolveNumber(process.env.CRAWL4AI_RETENTION_MAX_SESSIONS) ??
      DEFAULT_RETENTION.maxSessions,
    maxAgeDays:
      resolveNumber(fromJson.maxAgeDays) ??
      resolveNumber(process.env.CRAWL4AI_RETENTION_MAX_AGE_DAYS) ??
      DEFAULT_RETENTION.maxAgeDays,
    maxTotalMb:
      resolveNumber(fromJson.maxTotalMb) ??
      resolveNumber(process.env.CRAWL4AI_RETENTION_MAX_TOTAL_MB) ??
      DEFAULT_RETENTION.maxTotalMb,
  };
}

function resolveOutputDir(jsonConfig: Crawl4AIJsonConfig | null): string {
  if (jsonConfig?.outputDir) return resolveEnvVars(jsonConfig.outputDir);
  return process.env.CRAWL4AI_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
}

/** Resolve crawl4ai API bearer token from JSON (with ${ENV}) or CRAWL4AI_API_TOKEN. */
function resolveApiToken(jsonConfig: Crawl4AIJsonConfig | null): string | undefined {
  if (jsonConfig?.apiToken !== undefined && jsonConfig.apiToken !== null) {
    const resolved = resolveEnvVars(String(jsonConfig.apiToken)).trim();
    return resolved.length > 0 ? resolved : undefined;
  }
  const fromEnv = process.env.CRAWL4AI_API_TOKEN?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined;
}

export function mergeConfigWithEnv(jsonConfig: Crawl4AIJsonConfig | null): ResolvedConfig {
  const config: ResolvedConfig = {
    baseUrl: jsonConfig?.url
      ? resolveEnvVars(jsonConfig.url)
      : process.env.CRAWL4AI_BASE_URL || "http://localhost:11235",
    timeout: jsonConfig?.timeoutMs ?? resolveNumber(process.env.CRAWL4AI_TIMEOUT) ?? 60000,
    minRequestIntervalMs:
      jsonConfig?.minRequestIntervalMs !== undefined
        ? resolveNumber(jsonConfig.minRequestIntervalMs)
        : resolveNumber(process.env.CRAWL4AI_MIN_REQUEST_INTERVAL_MS),
    apiToken: resolveApiToken(jsonConfig),
    retention: resolveRetention(jsonConfig),
    outputDir: resolveOutputDir(jsonConfig),
    trafilatura: { pythonPath: resolveEnvVars(jsonConfig?.trafilatura?.pythonPath ?? process.env.CRAWL4AI_TRAFILATURA_PYTHON ?? "") || undefined },
  };
  const url = new URL(config.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("crawl4ai url must be HTTP(S) without embedded credentials");
  config.baseUrl = config.baseUrl.replace(/\/+$/, "");
  if (!Number.isFinite(config.timeout) || config.timeout <= 0) throw new Error("timeout must be positive and finite");
  for (const [name, value] of Object.entries({ minRequestIntervalMs: config.minRequestIntervalMs, maxSessions: config.retention.maxSessions, maxAgeDays: config.retention.maxAgeDays, maxTotalMb: config.retention.maxTotalMb })) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`${name} must be nonnegative and finite`);
  }
  if (!Number.isInteger(config.retention.maxSessions)) throw new Error("Session counts must be integers");
  return config;
}

export function loadConfig(cwd?: string): ResolvedConfig {
  loadEnvFile(cwd);
  const configPath = findConfigFile(cwd);
  const jsonConfig = configPath ? loadJsonConfig(configPath) : null;
  return mergeConfigWithEnv(jsonConfig);
}
