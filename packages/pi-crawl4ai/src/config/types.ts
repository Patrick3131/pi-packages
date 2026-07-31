import type { ProxyService } from "../proxy";

export interface AuthCookie {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

export interface ProxySettingsConfig {
  url?: string;
  provider?: "oxylabs" | "custom";
  host?: string;
  port?: string | number;
  ports?: string | number[];
  username?: string;
  password?: string;
}

export interface ResolvedProxySettings {
  url?: string;
  provider?: string;
  host?: string;
  port?: string;
  ports?: number[];
  username?: string;
  password?: string;
}

export interface AuthProfileConfig {
  matchSites?: string[];
  matchDomains?: string[];
  cookies?: AuthCookie[] | string;
  headers?: Record<string, string>;
  userAgent?: string;
  minRequestIntervalMs?: number | string;
  proxy?: ProxySettingsConfig;
}

export interface ResolvedAuthProfile {
  matchSites?: string[];
  matchDomains?: string[];
  cookies?: AuthCookie[];
  headers?: Record<string, string>;
  userAgent?: string;
  minRequestIntervalMs?: number;
  proxy?: ResolvedProxySettings;
}

export type ReturnModeConfig = "auto" | "inline" | "files";

export interface TokenBudgetSettings {
  maxCharsPerPage?: number;
  maxCharsPerCall?: number;
  returnMode?: ReturnModeConfig;
  preferFitMarkdown?: boolean;
  deepCrawlDefaultMaxPages?: number;
  excerptChars?: number;
}

export interface RetentionSettings {
  /** Run cleanup automatically after saves. Default true. */
  enabled?: boolean;
  /** Keep at most this many newest sessions. Default 20. */
  maxSessions?: number;
  /** Delete sessions older than this many days. Default 7. 0 disables age rule. */
  maxAgeDays?: number;
  /** Soft cap on total session size in MB. Default 512. 0 disables size rule. */
  maxTotalMb?: number;
}

export interface Crawl4AIJsonConfig {
  url?: string;
  timeoutMs?: number;
  enabledByDefault?: boolean;
  minRequestIntervalMs?: number | string;
  /**
   * crawl4ai Docker/API bearer token (CRAWL4AI_API_TOKEN).
   * Sent as Authorization: Bearer <token> on /crawl requests.
   * Supports ${ENV_VAR} substitution.
   */
  apiToken?: string;
  proxy?: ProxySettingsConfig;
  authProfiles?: Record<string, AuthProfileConfig>;
  /** Token-budget defaults for tool results returned to the model. */
  tokenBudget?: TokenBudgetSettings;
  /** Retention policy for saved crawl session directories. */
  retention?: RetentionSettings;
  /** Default directory for saved crawls (also used by auto-save / cleanup). */
  outputDir?: string;
}

export interface ResolvedTokenBudget {
  maxCharsPerPage: number;
  maxCharsPerCall: number;
  returnMode: ReturnModeConfig;
  preferFitMarkdown: boolean;
  deepCrawlDefaultMaxPages: number;
  excerptChars: number;
}

export interface ResolvedRetention {
  enabled: boolean;
  maxSessions: number;
  maxAgeDays: number;
  maxTotalMb: number;
}

export interface ResolvedConfig {
  baseUrl: string;
  timeout: number;
  enabledByDefault: boolean;
  minRequestIntervalMs?: number;
  /** Resolved crawl4ai API bearer token (never log the value). */
  apiToken?: string;
  proxyUrl?: string;
  proxyProvider?: string;
  proxyHost?: string;
  proxyPort?: string;
  proxyPorts?: number[];
  proxyUsername?: string;
  proxyPassword?: string;
  authProfiles?: Record<string, ResolvedAuthProfile>;
  tokenBudget: ResolvedTokenBudget;
  retention: ResolvedRetention;
  /** Default crawl output root (./output-crawl4ai or env/config override). */
  outputDir: string;
}

export interface Crawl4AIConfig {
  baseUrl: string;
  timeout: number;
  /** Optional bearer token for the crawl4ai HTTP API. */
  apiToken?: string;
  proxyService: ProxyService;
  proxyEnabled: boolean;
  raw: ResolvedConfig;
}

export interface ResolveAuthProfileOptions {
  urls: string[];
  site?: string;
  authProfile?: string;
}

export interface ResolvedAuthSelection {
  profileName: string;
  profile: ResolvedAuthProfile;
  reason: "explicit-profile" | "site" | "domain";
}
