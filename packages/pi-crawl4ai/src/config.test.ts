/**
 * Tests for config module
 */

import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { loadConfig, buildBrowserConfig, resolveAuthSelection } from "./config";
import { resetEnv } from "./test-utils";

let tempDir: string;

beforeAll(() => {
  tempDir = join(__dirname, "__test_temp__", `config-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetEnv();
});

describe("loadConfig", () => {
  it("should return default values when no config or env vars are set", () => {
    const config = loadConfig({ cwd: tempDir });

    expect(config.baseUrl).toBe("http://localhost:11235");
    expect(config.timeout).toBe(60000);
    expect(config.proxyEnabled).toBe(false);
  });

  it("should use CRAWL4AI_BASE_URL when set", () => {
    process.env.CRAWL4AI_BASE_URL = "http://custom-host:8080";

    const config = loadConfig({ cwd: tempDir });

    expect(config.baseUrl).toBe("http://custom-host:8080");
  });

  it("should use CRAWL4AI_TIMEOUT when set", () => {
    process.env.CRAWL4AI_TIMEOUT = "30000";

    const config = loadConfig({ cwd: tempDir });

    expect(config.timeout).toBe(30000);
  });

  it("should enable proxy from OXYLABS env vars", () => {
    process.env.OXYLABS_USER = "testuser";
    process.env.OXYLABS_PASS = "testpass";

    const config = loadConfig({ cwd: tempDir });

    expect(config.proxyEnabled).toBe(true);
  });

  it("should enable proxy from CRAWL4AI_PROXY_URL", () => {
    process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy.example.com:8080";

    const config = loadConfig({ cwd: tempDir });

    expect(config.proxyEnabled).toBe(true);
  });

  it("should expose enabledByDefault from raw config (default false)", () => {
    const config = loadConfig({ cwd: tempDir });

    expect(config.raw.enabledByDefault).toBe(false);
  });
});

describe("resolveAuthSelection", () => {
  it("should resolve a profile by domain", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com", "twitter.com"],
        matchSites: ["x", "twitter"],
        cookies: [{ name: "auth_token", value: "secret" }],
      },
    };

    const selection = resolveAuthSelection(config, {
      urls: ["https://x.com/some/thread"],
    });

    expect(selection?.profileName).toBe("x-main");
    expect(selection?.reason).toBe("domain");
  });

  it("should resolve a profile by site hint", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com", "twitter.com"],
        matchSites: ["x", "twitter"],
        cookies: [{ name: "auth_token", value: "secret" }],
      },
    };

    const selection = resolveAuthSelection(config, {
      urls: ["https://x.com/some/thread"],
      site: "X",
    });

    expect(selection?.profileName).toBe("x-main");
    expect(selection?.reason).toBe("site");
  });

  it("should reject explicit profiles for mismatched domains", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com", "twitter.com"],
      },
    };

    expect(() =>
      resolveAuthSelection(config, {
        urls: ["https://reddit.com/r/test"],
        authProfile: "x-main",
      })
    ).toThrow('Auth profile "x-main" is not allowed');
  });
});

describe("buildBrowserConfig", () => {
  it("should return empty object when proxy is disabled", () => {
    const config = loadConfig({ cwd: tempDir });
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toEqual({});
  });

  it("should include proxy config when proxy is enabled via Oxylabs", () => {
    process.env.OXYLABS_USER = "testuser";
    process.env.OXYLABS_PASS = "testpass";
    process.env.OXYLABS_PORT = "7777"; // Use single port for predictable test

    const config = loadConfig({ cwd: tempDir });
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toHaveProperty("proxy_config");
    expect(browserConfig.proxy_config).toEqual({
      server: "http://isp.oxylabs.io:7777",
      username: "user-testuser",
      password: "testpass",
    });
  });

  it("should include proxy config when proxy is enabled via URL", () => {
    process.env.CRAWL4AI_PROXY_URL = "http://myuser:mypass@proxy.example.com:9999";

    const config = loadConfig({ cwd: tempDir });
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toHaveProperty("proxy_config");
    expect(browserConfig.proxy_config).toEqual({
      server: "http://proxy.example.com:9999",
      username: "myuser",
      password: "mypass",
    });
  });

  it("should merge auth profile headers, user agent, and cookies", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com"],
        headers: {
          "x-test": "1",
        },
        userAgent: "Mozilla/5.0 Test",
        cookies: [
          { name: "auth_token", value: "secret" },
          { name: "ct0", value: "csrf" },
        ],
      },
    };

    const selection = resolveAuthSelection(config, {
      urls: ["https://x.com/some/thread"],
      authProfile: "x-main",
    });
    const browserConfig = buildBrowserConfig(config, selection);

    expect(browserConfig.headers).toEqual({
      "x-test": "1",
      Cookie: "auth_token=secret; ct0=csrf",
    });
    expect(browserConfig.user_agent).toBe("Mozilla/5.0 Test");
    expect(browserConfig.cookies).toEqual([
      { name: "auth_token", value: "secret" },
      { name: "ct0", value: "csrf" },
    ]);
  });
});
