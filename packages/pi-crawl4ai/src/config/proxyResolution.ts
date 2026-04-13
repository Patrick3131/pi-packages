import { resolveEnvVars } from "./env";
import type { Crawl4AIJsonConfig, ResolvedConfig } from "./types";

function parsePorts(value?: string | number[]): number[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  const ports = value.split(",").map((port) => parseInt(port.trim(), 10)).filter((port) => !isNaN(port));
  return ports.length > 0 ? ports : undefined;
}

export function applyJsonProxyConfig(config: ResolvedConfig, jsonConfig: Crawl4AIJsonConfig | null): void {
  const proxy = jsonConfig?.proxy;
  if (!proxy) return;
  if (proxy.url) {
    config.proxyUrl = resolveEnvVars(proxy.url);
    return;
  }
  if (proxy.provider !== "oxylabs" && !proxy.username) return;

  config.proxyProvider = proxy.provider || "oxylabs";
  config.proxyHost = proxy.host ? resolveEnvVars(proxy.host) : undefined;
  config.proxyPort = typeof proxy.port === "number" ? String(proxy.port) : proxy.port;
  config.proxyPorts = parsePorts(proxy.ports);
  config.proxyUsername = proxy.username ? resolveEnvVars(proxy.username) : process.env.OXYLABS_USER;
  config.proxyPassword = proxy.password ? resolveEnvVars(proxy.password) : process.env.OXYLABS_PASS;
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
