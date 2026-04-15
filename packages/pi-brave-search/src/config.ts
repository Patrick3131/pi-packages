import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BraveSearchJsonConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  enabledByDefault?: boolean;
  minRequestIntervalMs?: number;
}

export interface BraveSearchConfig {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  enabledByDefault: boolean;
  minRequestIntervalMs: number;
}

export interface LoadConfigOptions {
  cwd?: string;
  log?: (level: "info" | "warn", message: string) => void;
}

const DEFAULT_BASE_URL = "https://api.search.brave.com/res/v1";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1000;
const PROJECT_CONFIG = ".pi/brave-search.json";
const GLOBAL_CONFIG = join(homedir(), ".pi/agent/extensions/brave-search.json");

function substituteEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name) => process.env[name] ?? "");
}

function resolveEnvInObject<T>(value: T): T {
  if (typeof value === "string") {
    return substituteEnv(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvInObject(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, resolveEnvInObject(entry)])
    ) as T;
  }

  return value;
}

export function findConfigFile(cwd = process.cwd()): string | undefined {
  const projectPath = join(cwd, PROJECT_CONFIG);
  if (existsSync(projectPath)) {
    return projectPath;
  }

  if (existsSync(GLOBAL_CONFIG)) {
    return GLOBAL_CONFIG;
  }

  return undefined;
}

export function loadJsonConfig(path: string): BraveSearchJsonConfig {
  const raw = readFileSync(path, "utf8");
  return resolveEnvInObject(JSON.parse(raw));
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function loadConfig(options: LoadConfigOptions = {}): BraveSearchConfig {
  const configPath = findConfigFile(options.cwd);
  const jsonConfig = configPath ? loadJsonConfig(configPath) : {};

  if (configPath) {
    options.log?.("info", `Loaded config from ${configPath}`);
  }

  return {
    apiKey: jsonConfig.apiKey ?? process.env.BRAVE_SEARCH_API_KEY,
    baseUrl: (jsonConfig.baseUrl ?? process.env.BRAVE_SEARCH_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
    timeoutMs: Number(jsonConfig.timeoutMs ?? process.env.BRAVE_SEARCH_TIMEOUT ?? DEFAULT_TIMEOUT_MS),
    enabledByDefault:
      jsonConfig.enabledByDefault ?? parseBoolean(process.env.BRAVE_SEARCH_ENABLED_BY_DEFAULT) ?? false,
    minRequestIntervalMs: Number(
      jsonConfig.minRequestIntervalMs ?? process.env.BRAVE_SEARCH_MIN_INTERVAL_MS ?? DEFAULT_MIN_REQUEST_INTERVAL_MS
    ),
  };
}
