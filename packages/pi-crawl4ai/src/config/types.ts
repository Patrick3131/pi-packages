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
  minRequestIntervalMs?: number | string;
  /**
   * crawl4ai Docker/API bearer token (CRAWL4AI_API_TOKEN).
   * Sent as Authorization: Bearer <token> on /crawl requests.
   * Supports ${ENV_VAR} substitution.
   */
  apiToken?: string;
  /** Retention policy for saved crawl session directories. */
  retention?: RetentionSettings;
  /** Default directory for saved crawls (also used by auto-save / cleanup). */
  outputDir?: string;
  trafilatura?: { pythonPath?: string };
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
  minRequestIntervalMs?: number;
  /** Resolved crawl4ai API bearer token (never log the value). */
  apiToken?: string;
  retention: ResolvedRetention;
  /** Default crawl output root (./output-crawl4ai or env/config override). */
  outputDir: string;
  trafilatura?: { pythonPath?: string };
}

export interface Crawl4AIConfig {
  baseUrl: string;
  timeout: number;
  /** Optional bearer token for the crawl4ai HTTP API. */
  apiToken?: string;
  raw: ResolvedConfig;
}
