import { resolveEnvVars } from "./env";
import type { Crawl4AIJsonConfig, ProxySettingsConfig, ResolvedConfig, ResolvedProxySettings } from "./types";

export function parsePorts(value?: string | number[]): number[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  const ports = value.split(",").map((port) => parseInt(port.trim(), 10)).filter((port) => !isNaN(port));
  return ports.length > 0 ? ports : undefined;
}

export function resolveProxySettings(proxy?: ProxySettingsConfig): ResolvedProxySettings | undefined {
  if (!proxy) return undefined;
  if (proxy.url) {
    return { url: resolveEnvVars(proxy.url) };
  }
  if (proxy.provider !== "oxylabs" && !proxy.username) return undefined;

  return {
    provider: proxy.provider || "oxylabs",
    host: proxy.host ? resolveEnvVars(proxy.host) : undefined,
    port: typeof proxy.port === "number" ? String(proxy.port) : proxy.port,
    ports: parsePorts(proxy.ports),
    username: proxy.username ? resolveEnvVars(proxy.username) : process.env.OXYLABS_USER,
    password: proxy.password ? resolveEnvVars(proxy.password) : process.env.OXYLABS_PASS,
  };
}

export function applyJsonProxyConfig(config: ResolvedConfig, jsonConfig: Crawl4AIJsonConfig | null): void {
  const resolved = resolveProxySettings(jsonConfig?.proxy);
  if (!resolved) return;
  if (resolved.url) {
    config.proxyUrl = resolved.url;
    return;
  }

  config.proxyProvider = resolved.provider;
  config.proxyHost = resolved.host;
  config.proxyPort = resolved.port;
  config.proxyPorts = resolved.ports;
  config.proxyUsername = resolved.username;
  config.proxyPassword = resolved.password;
}

export function applyEnvProxyConfig(config: ResolvedConfig): void {
  if (config.proxyUrl || config.proxyUsername) return;
  config.proxyUrl = process.env.CRAWL4AI_PROXY_URL;
  if (config.proxyUrl) return;

  const oxylabsUser = process.env.OXYLABS_USER;
  const oxylabsPass = process.env.OXYLABS_PASS;
  if (!oxylabsUser || !oxylabsPass) return;

  config.proxyProvider = "oxylabs";
  config.proxyHost = process.env.OXYLABS_HOST || "isp.oxylabs.io";
  config.proxyPort = process.env.OXYLABS_PORT;
  config.proxyPorts = parsePorts(process.env.OXYLABS_PORTS);
  config.proxyUsername = oxylabsUser;
  config.proxyPassword = oxylabsPass;
}
