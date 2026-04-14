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
  backoffMs?: number | string;
  proxy?: ProxySettingsConfig;
}

export interface ResolvedAuthProfile {
  matchSites?: string[];
  matchDomains?: string[];
  cookies?: AuthCookie[];
  headers?: Record<string, string>;
  userAgent?: string;
  backoffMs?: number;
  proxy?: ResolvedProxySettings;
}

export interface Crawl4AIJsonConfig {
  url?: string;
  timeoutMs?: number;
  enabledByDefault?: boolean;
  backoffMs?: number | string;
  proxy?: ProxySettingsConfig;
  authProfiles?: Record<string, AuthProfileConfig>;
}

export interface ResolvedConfig {
  baseUrl: string;
  timeout: number;
  enabledByDefault: boolean;
  backoffMs?: number;
  proxyUrl?: string;
  proxyProvider?: string;
  proxyHost?: string;
  proxyPort?: string;
  proxyPorts?: number[];
  proxyUsername?: string;
  proxyPassword?: string;
  authProfiles?: Record<string, ResolvedAuthProfile>;
}

export interface Crawl4AIConfig {
  baseUrl: string;
  timeout: number;
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
