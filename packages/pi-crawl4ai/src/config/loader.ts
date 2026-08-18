import { loadEnvFile, resolveEnvVars, resolveNumber } from "./env";
import { findConfigFile, loadJsonConfig } from "./files";
import { resolveAuthProfiles } from "./authProfiles";
import type {
  Crawl4AIJsonConfig,
  ResolvedConfig,
  ResolvedRetention,
  ResolvedTokenBudget,
  RetentionSettings,
  ReturnModeConfig,
  TokenBudgetSettings,
} from "./types";

export { findConfigFile, loadJsonConfig } from "./files";
export type {
  AuthCookie,
  AuthProfileConfig,
  Crawl4AIJsonConfig,
  ResolvedAuthProfile,
  ResolvedConfig,
  ResolvedRetention,
  ResolvedTokenBudget,
  RetentionSettings,
  ReturnModeConfig,
  TokenBudgetSettings,
} from "./types";

const DEFAULT_TOKEN_BUDGET: ResolvedTokenBudget = {
  maxCharsPerPage: 12_000,
  maxCharsPerCall: 40_000,
  returnMode: "auto",
  preferFitMarkdown: true,
  deepCrawlDefaultMaxPages: 10,
  excerptChars: 200,
};

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

function parseReturnMode(value: string | undefined, fallback: ReturnModeConfig): ReturnModeConfig {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "inline" || normalized === "files") {
    return normalized;
  }
  return fallback;
}

function resolveTokenBudget(jsonConfig: Crawl4AIJsonConfig | null): ResolvedTokenBudget {
  const fromJson: TokenBudgetSettings = jsonConfig?.tokenBudget ?? {};
  return {
    maxCharsPerPage:
      resolveNumber(fromJson.maxCharsPerPage) ??
      resolveNumber(process.env.CRAWL4AI_MAX_CHARS_PER_PAGE) ??
      DEFAULT_TOKEN_BUDGET.maxCharsPerPage,
    maxCharsPerCall:
      resolveNumber(fromJson.maxCharsPerCall) ??
      resolveNumber(process.env.CRAWL4AI_MAX_CHARS_PER_CALL) ??
      DEFAULT_TOKEN_BUDGET.maxCharsPerCall,
    returnMode:
      fromJson.returnMode ??
      parseReturnMode(process.env.CRAWL4AI_RETURN_MODE, DEFAULT_TOKEN_BUDGET.returnMode),
    preferFitMarkdown:
      fromJson.preferFitMarkdown ??
      parseBoolean(process.env.CRAWL4AI_PREFER_FIT_MARKDOWN, DEFAULT_TOKEN_BUDGET.preferFitMarkdown),
    deepCrawlDefaultMaxPages:
      resolveNumber(fromJson.deepCrawlDefaultMaxPages) ??
      resolveNumber(process.env.CRAWL4AI_DEEP_CRAWL_DEFAULT_MAX_PAGES) ??
      DEFAULT_TOKEN_BUDGET.deepCrawlDefaultMaxPages,
    excerptChars:
      resolveNumber(fromJson.excerptChars) ??
      resolveNumber(process.env.CRAWL4AI_EXCERPT_CHARS) ??
      DEFAULT_TOKEN_BUDGET.excerptChars,
  };
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
  return {
    baseUrl: jsonConfig?.url
      ? resolveEnvVars(jsonConfig.url)
      : process.env.CRAWL4AI_BASE_URL || "http://localhost:11235",
    timeout: jsonConfig?.timeoutMs || parseInt(process.env.CRAWL4AI_TIMEOUT || "60000", 10),
    minRequestIntervalMs:
      jsonConfig?.minRequestIntervalMs !== undefined
        ? resolveNumber(jsonConfig.minRequestIntervalMs)
        : resolveNumber(process.env.CRAWL4AI_MIN_REQUEST_INTERVAL_MS),
    apiToken: resolveApiToken(jsonConfig),
    authProfiles: resolveAuthProfiles(jsonConfig?.authProfiles),
    tokenBudget: resolveTokenBudget(jsonConfig),
    retention: resolveRetention(jsonConfig),
    outputDir: resolveOutputDir(jsonConfig),
  };
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
