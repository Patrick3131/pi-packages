import { createProxyService, type ProxyService } from "../proxy";
import { createCustomAdapter, type CustomProxySettings } from "../proxy/adapters";
import type { ProxyAdapter, ProxyEndpoint } from "../proxy";
import { loadConfig as loadResolvedConfig } from "./loader";
import type { Crawl4AIConfig, ResolvedProxySettings } from "./types";

function createEndpoints(config: {
  proxyProvider?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  proxyHost?: string;
  proxyPorts?: number[];
}): ProxyEndpoint[] | undefined {
  const username = config.proxyProvider === "oxylabs" && config.proxyUsername
    ? (config.proxyUsername.startsWith("user-") ? config.proxyUsername : `user-${config.proxyUsername}`)
    : config.proxyUsername;
  return config.proxyPorts?.map((port, index) => ({
    id: `custom-${port}`,
    server: `http://${config.proxyHost || "proxy"}:${port}`,
    username,
    password: config.proxyPassword,
    provider: config.proxyProvider || "custom",
    metadata: { port, index },
  }));
}

export function createProxyServiceFromResolvedSettings(
  proxy: ResolvedProxySettings | undefined,
  log?: (level: "info" | "warn" | "error", message: string) => void
): ProxyService {
  const customAdapters: ProxyAdapter[] = [];

  if (proxy?.url || (proxy?.host && (proxy.port || proxy.ports))) {
    customAdapters.push(createCustomAdapter({
      url: proxy.url,
      host: proxy.host,
      port: proxy.port,
      username: proxy.provider === "oxylabs" && proxy.username && !proxy.username.startsWith("user-")
        ? `user-${proxy.username}`
        : proxy.username,
      password: proxy.password,
      endpoints: createEndpoints({
        proxyProvider: proxy.provider,
        proxyUsername: proxy.username,
        proxyPassword: proxy.password,
        proxyHost: proxy.host,
        proxyPorts: proxy.ports,
      }),
    } satisfies CustomProxySettings));
  }

  return createProxyService({ customAdapters, log });
}

export function loadRuntimeConfig(options?: { cwd?: string; log?: (level: "info" | "warn" | "error", message: string) => void; }): Crawl4AIConfig {
  const log = options?.log || (() => {});
  const raw = loadResolvedConfig(options?.cwd);
  const proxyService = createProxyServiceFromResolvedSettings({
    url: raw.proxyUrl,
    provider: raw.proxyProvider,
    host: raw.proxyHost,
    port: raw.proxyPort,
    ports: raw.proxyPorts,
    username: raw.proxyUsername,
    password: raw.proxyPassword,
  }, log);
  if (proxyService.isEnabled()) {
    log("info", "Using proxy from config");
  }
  return { baseUrl: raw.baseUrl, timeout: raw.timeout, proxyService, proxyEnabled: proxyService.isEnabled(), raw };
}
