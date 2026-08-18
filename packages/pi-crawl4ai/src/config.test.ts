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
    expect(config.apiToken).toBeUndefined();
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

  it("should load api token from env", () => {
    process.env.CRAWL4AI_API_TOKEN = "secret-token";

    const config = loadConfig({ cwd: tempDir });

    expect(config.apiToken).toBe("secret-token");
  });

  it("should ignore legacy client proxy env vars", () => {
    process.env.OXYLABS_USER = "testuser";
    process.env.OXYLABS_PASS = "testpass";
    process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy.example.com:8080";

    const config = loadConfig({ cwd: tempDir });
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toEqual({});
    expect(browserConfig).not.toHaveProperty("proxy_config");
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

  it("should resolve a profile by domain when the URL is missing https", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com", "twitter.com"],
        cookies: [{ name: "auth_token", value: "secret" }],
      },
    };

    const selection = resolveAuthSelection(config, {
      urls: ["x.com/some/thread"],
    });

    expect(selection?.profileName).toBe("x-main");
    expect(selection?.reason).toBe("domain");
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
  it("should return empty object without auth selection", () => {
    const config = loadConfig({ cwd: tempDir });
    const browserConfig = buildBrowserConfig(config);

    expect(browserConfig).toEqual({});
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
    const browserConfig = buildBrowserConfig(config, selection, ["https://x.com/some/thread"]);

    expect(browserConfig.headers).toEqual({
      "x-test": "1",
      Cookie: "auth_token=secret; ct0=csrf",
    });
    expect(browserConfig.user_agent).toBe("Mozilla/5.0 Test");
    expect(browserConfig.cookies).toEqual([
      { name: "auth_token", value: "secret", url: "https://x.com/some/thread" },
      { name: "ct0", value: "csrf", url: "https://x.com/some/thread" },
    ]);
    expect(browserConfig).not.toHaveProperty("proxy_config");
  });

  it("should preserve cookies that already include domain and path", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com"],
        cookies: [
          { name: "auth_token", value: "secret", domain: ".x.com", path: "/" },
        ],
      },
    };

    const selection = resolveAuthSelection(config, {
      urls: ["https://x.com/some/thread"],
      authProfile: "x-main",
    });
    const browserConfig = buildBrowserConfig(config, selection, ["https://x.com/some/thread"]);

    expect(browserConfig.cookies).toEqual([
      { name: "auth_token", value: "secret", domain: ".x.com", path: "/" },
    ]);
  });

  it("should add https when deriving cookie url from a scheme-less target URL", () => {
    const config = loadConfig({ cwd: tempDir });
    config.raw.authProfiles = {
      "x-main": {
        matchDomains: ["x.com"],
        cookies: [
          { name: "auth_token", value: "secret" },
        ],
      },
    };

    const selection = resolveAuthSelection(config, {
      urls: ["x.com/some/thread"],
      authProfile: "x-main",
    });
    const browserConfig = buildBrowserConfig(config, selection, ["x.com/some/thread"]);

    expect(browserConfig.cookies).toEqual([
      { name: "auth_token", value: "secret", url: "https://x.com/some/thread" },
    ]);
  });
});
