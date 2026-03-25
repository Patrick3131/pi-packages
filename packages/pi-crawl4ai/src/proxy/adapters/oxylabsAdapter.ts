/**
 * Oxylabs ISP proxy adapter with multi-port rotation support.
 */

import type { ProxyAdapter, ProxyConfig, ProxyEndpoint, ProxyEndpointsResult } from "../types";

export const OXYLABS_USER_ENV = "OXYLABS_USER";
export const OXYLABS_PASS_ENV = "OXYLABS_PASS";
export const OXYLABS_HOST_ENV = "OXYLABS_HOST";
export const OXYLABS_PORT_ENV = "OXYLABS_PORT";
export const OXYLABS_PORTS_ENV = "OXYLABS_PORTS"; // Comma-separated for multiple

const DEFAULT_HOST = "isp.oxylabs.io";
const DEFAULT_PORTS = [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010];

/**
 * Parse ports from environment variable or use defaults.
 */
function parsePorts(envValue: string | undefined): number[] {
  if (!envValue) return [...DEFAULT_PORTS];

  const parsed = envValue
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);

  return parsed.length > 0 ? parsed : [...DEFAULT_PORTS];
}

/**
 * Build Oxylabs username with required prefix.
 */
function buildUsername(user: string): string {
  return user.startsWith("user-") ? user : `user-${user}`;
}

/**
 * Adapter for Oxylabs ISP residential proxies with rotation.
 *
 * Required env vars:
 * - OXYLABS_USER: Your Oxylabs username
 * - OXYLABS_PASS: Your Oxylabs password
 *
 * Optional env vars:
 * - OXYLABS_HOST: Proxy host (default: isp.oxylabs.io)
 * - OXYLABS_PORT: Single port (for single endpoint)
 * - OXYLABS_PORTS: Comma-separated ports for rotation (default: 8001-8010)
 */
export const oxylabsAdapter: ProxyAdapter = {
  name: "oxylabs",

  isConfigured(): boolean {
    const user = process.env[OXYLABS_USER_ENV];
    const pass = process.env[OXYLABS_PASS_ENV];
    return typeof user === "string" && user.length > 0 &&
           typeof pass === "string" && pass.length > 0;
  },

  getConfig(): ProxyConfig {
    const user = process.env[OXYLABS_USER_ENV];
    const pass = process.env[OXYLABS_PASS_ENV];
    const host = process.env[OXYLABS_HOST_ENV] || DEFAULT_HOST;
    const singlePort = process.env[OXYLABS_PORT_ENV];

    if (!user || !pass) {
      throw new Error(`Oxylabs requires ${OXYLABS_USER_ENV} and ${OXYLABS_PASS_ENV}`);
    }

    const port = singlePort ? parseInt(singlePort, 10) : DEFAULT_PORTS[0];
    const username = buildUsername(user);

    return {
      server: `http://${host}:${port}`,
      username,
      password: pass,
      adapterName: this.name,
    };
  },

  getEndpoints(): ProxyEndpointsResult {
    const user = process.env[OXYLABS_USER_ENV];
    const pass = process.env[OXYLABS_PASS_ENV];

    if (!user || !pass) {
      return { configured: false, endpoints: [] };
    }

    const host = process.env[OXYLABS_HOST_ENV] || DEFAULT_HOST;

    // Use OXYLABS_PORTS for multiple, or OXYLABS_PORT for single, or defaults
    let ports: number[];
    if (process.env[OXYLABS_PORTS_ENV]) {
      ports = parsePorts(process.env[OXYLABS_PORTS_ENV]);
    } else if (process.env[OXYLABS_PORT_ENV]) {
      ports = [parseInt(process.env[OXYLABS_PORT_ENV], 10)];
    } else {
      ports = [...DEFAULT_PORTS];
    }

    const username = buildUsername(user);

    const endpoints: ProxyEndpoint[] = ports.map((port, index) => ({
      id: `oxylabs-${port}`,
      server: `http://${host}:${port}`,
      username,
      password: pass,
      provider: this.name,
      metadata: { port, index },
    }));

    return { configured: true, endpoints };
  },
};
