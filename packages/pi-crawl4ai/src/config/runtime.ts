import { createProxyService } from "../proxy";
import { createCustomAdapter, type CustomProxySettings } from "../proxy/adapters";
import type { ProxyAdapter, ProxyEndpoint } from "../proxy";
import { loadConfig as loadResolvedConfig } from "./loader";
import type { Crawl4AIConfig } from "./types";

function createEndpoints(config: Crawl4AIConfig["raw"]): ProxyEndpoint[] | undefined {
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

export function loadRuntimeConfig(options?: { cwd?: string; log?: (level: "info" | "warn" | "error", message: string) => void; }): Crawl4AIConfig {
  const log = options?.log || (() => {});
  const raw = loadResolvedConfig(options?.cwd);
  const customAdapters: ProxyAdapter[] = [];

  if (raw.proxyUrl || (raw.proxyHost && (raw.proxyPort || raw.proxyPorts))) {
    customAdapters.push(createCustomAdapter({
      url: raw.proxyUrl,
      host: raw.proxyHost,
      port: raw.proxyPort,
      username: raw.proxyProvider === "oxylabs" && raw.proxyUsername && !raw.proxyUsername.startsWith("user-") ? `user-${raw.proxyUsername}` : raw.proxyUsername,
      password: raw.proxyPassword,
      endpoints: createEndpoints(raw),
    } satisfies CustomProxySettings));
    log("info", "Using proxy from config");
  }

  const proxyService = createProxyService({ customAdapters, log });
  return { baseUrl: raw.baseUrl, timeout: raw.timeout, proxyService, proxyEnabled: proxyService.isEnabled(), raw };
}
