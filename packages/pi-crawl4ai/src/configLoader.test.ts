/**
 * Tests for configLoader module
 */

import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { findConfigFile, loadJsonConfig, mergeConfigWithEnv, type Crawl4AIJsonConfig } from "./configLoader";
import { resetEnv } from "./test-utils";

// Mock homedir to use a temp directory
const originalHomedir = require("node:os").homedir;
let tempDir: string;

beforeAll(() => {
  tempDir = join(__dirname, "__test_temp__", `config-loader-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  require("node:os").homedir = () => tempDir;
});

afterAll(() => {
  require("node:os").homedir = originalHomedir;
  rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetEnv();
});

describe("findConfigFile", () => {
  let testDir: string;
  let piDir: string;

  beforeEach(() => {
    testDir = join(tempDir, `find-test-${Date.now()}`);
    piDir = join(testDir, ".pi");
    mkdirSync(testDir, { recursive: true });
    mkdirSync(piDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should find config in project directory", () => {
    const configPath = join(testDir, "crawl4ai.json");
    writeFileSync(configPath, "{}");

    const found = findConfigFile(testDir);
    expect(found).toBe(configPath);
  });

  it("should find config in .pi directory", () => {
    const configPath = join(piDir, "crawl4ai.json");
    writeFileSync(configPath, "{}");

    const found = findConfigFile(testDir);
    expect(found).toBe(configPath);
  });

  it("should return null if no config file exists", () => {
    const found = findConfigFile(testDir);
    expect(found).toBeNull();
  });

  it("should find config in project directory before .pi directory", () => {
    writeFileSync(join(testDir, "crawl4ai.json"), '{"url": "project"}');
    writeFileSync(join(piDir, "crawl4ai.json"), '{"url": "pi"}');

    const found = findConfigFile(testDir);
    // Project directory is searched first
    expect(found).toBe(join(testDir, "crawl4ai.json"));
  });

  it("should find config in .pi directory if not in project", () => {
    writeFileSync(join(piDir, "crawl4ai.json"), '{"url": "pi"}');

    const found = findConfigFile(testDir);
    expect(found).toBe(join(piDir, "crawl4ai.json"));
  });
});

describe("loadJsonConfig", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tempDir, `load-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should load valid JSON config", () => {
    const configPath = join(testDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ url: "http://test:1234", timeoutMs: 30000 }));

    const config = loadJsonConfig(configPath);

    expect(config).toEqual({
      url: "http://test:1234",
      timeoutMs: 30000,
    });
  });

  it("should return null for invalid JSON", () => {
    const configPath = join(testDir, "invalid.json");
    writeFileSync(configPath, "not valid json");

    const config = loadJsonConfig(configPath);

    expect(config).toBeNull();
  });

  it("should return null for non-existent file", () => {
    const config = loadJsonConfig(join(testDir, "missing.json"));

    expect(config).toBeNull();
  });
});

describe("mergeConfigWithEnv", () => {
  beforeEach(() => {
    resetEnv();
  });

  it("should use defaults when no config or env vars", () => {
    const config = mergeConfigWithEnv(null);

    expect(config.baseUrl).toBe("http://localhost:11235");
    expect(config.timeout).toBe(60000);
    expect(config.minRequestIntervalMs).toBeUndefined();
    expect(config.proxyUrl).toBeUndefined();
  });

  it("should use env vars when no JSON config", () => {
    process.env.CRAWL4AI_BASE_URL = "http://env:9999";
    process.env.CRAWL4AI_TIMEOUT = "45000";

    const config = mergeConfigWithEnv(null);

    expect(config.baseUrl).toBe("http://env:9999");
    expect(config.timeout).toBe(45000);
    expect(config.minRequestIntervalMs).toBeUndefined();
  });

  it("should prefer JSON config over env vars", () => {
    process.env.CRAWL4AI_BASE_URL = "http://env:9999";
    process.env.CRAWL4AI_TIMEOUT = "45000";

    const jsonConfig: Crawl4AIJsonConfig = {
      url: "http://json:8888",
      timeoutMs: 30000,
      minRequestIntervalMs: 1500,
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.baseUrl).toBe("http://json:8888");
    expect(config.timeout).toBe(30000);
    expect(config.minRequestIntervalMs).toBe(1500);
  });

  it("should use env vars for missing JSON fields", () => {
    process.env.CRAWL4AI_BASE_URL = "http://env:9999";

    const jsonConfig: Crawl4AIJsonConfig = {
      timeoutMs: 30000,
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.baseUrl).toBe("http://env:9999");
    expect(config.timeout).toBe(30000);
    expect(config.minRequestIntervalMs).toBeUndefined();
  });

  it("should extract proxy URL from JSON config", () => {
    const jsonConfig: Crawl4AIJsonConfig = {
      proxy: {
        url: "http://user:pass@proxy.example.com:8080",
      },
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.proxyUrl).toBe("http://user:pass@proxy.example.com:8080");
  });

  it("should extract proxy settings from JSON config", () => {
    const jsonConfig: Crawl4AIJsonConfig = {
      proxy: {
        provider: "oxylabs",
        host: "custom.proxy.io",
        port: 9999,
        username: "testuser",
        password: "testpass",
      },
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.proxyProvider).toBe("oxylabs");
    expect(config.proxyHost).toBe("custom.proxy.io");
    expect(config.proxyPort).toBe("9999");
    expect(config.proxyUsername).toBe("testuser");
    expect(config.proxyPassword).toBe("testpass");
  });

  it("should use env vars for proxy when not in JSON config", () => {
    process.env.OXYLABS_USER = "envuser";
    process.env.OXYLABS_PASS = "envpass";

    const config = mergeConfigWithEnv({});

    expect(config.proxyUsername).toBe("envuser");
    expect(config.proxyPassword).toBe("envpass");
    expect(config.proxyProvider).toBe("oxylabs");
    expect(config.proxyHost).toBe("isp.oxylabs.io");
    // proxyPorts is only set if OXYLABS_PORTS is explicitly provided
    // Defaults are handled by the adapter, not the config loader
    expect(config.proxyPorts).toBeUndefined();
  });

  it("should prefer JSON proxy over env vars", () => {
    process.env.CRAWL4AI_PROXY_URL = "http://env:8080";
    process.env.OXYLABS_USER = "envuser";

    const jsonConfig: Crawl4AIJsonConfig = {
      proxy: {
        url: "http://json:9090",
      },
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.proxyUrl).toBe("http://json:9090");
  });

  describe("authProfiles", () => {
    it("should resolve auth profiles with env substitution", () => {
      process.env.X_COOKIES_JSON = JSON.stringify([
        { name: "auth_token", value: "secret", domain: ".x.com" },
        { name: "ct0", value: "csrf", domain: ".x.com" },
      ]);
      process.env.X_USER_AGENT = "Mozilla/5.0 Test";
      process.env.X_MIN_REQUEST_INTERVAL_MS = "5000";

      const jsonConfig: Crawl4AIJsonConfig = {
        authProfiles: {
          "x-main": {
            matchSites: ["X", "twitter"],
            matchDomains: ["x.com", "twitter.com"],
            cookies: "${X_COOKIES_JSON}",
            headers: {
              "x-test": "${X_USER_AGENT}",
            },
            userAgent: "${X_USER_AGENT}",
            minRequestIntervalMs: "${X_MIN_REQUEST_INTERVAL_MS}",
          },
        },
      };

      const config = mergeConfigWithEnv(jsonConfig);

      expect(config.authProfiles?.["x-main"]).toEqual({
        matchSites: ["x", "twitter"],
        matchDomains: ["x.com", "twitter.com"],
        cookies: [
          { name: "auth_token", value: "secret", domain: ".x.com" },
          { name: "ct0", value: "csrf", domain: ".x.com" },
        ],
        headers: {
          "x-test": "Mozilla/5.0 Test",
        },
        userAgent: "Mozilla/5.0 Test",
        minRequestIntervalMs: 5000,
      });
    });

    it("should parse cookie header strings in auth profiles", () => {
      const jsonConfig: Crawl4AIJsonConfig = {
        authProfiles: {
          "reddit-main": {
            matchDomains: ["reddit.com"],
            cookies: "session=abc; csrf=def",
          },
        },
      };

      const config = mergeConfigWithEnv(jsonConfig);

      expect(config.authProfiles?.["reddit-main"]?.cookies).toEqual([
        { name: "session", value: "abc" },
        { name: "csrf", value: "def" },
      ]);
    });

    it("should resolve per-auth-profile proxy overrides", () => {
      const jsonConfig: Crawl4AIJsonConfig = {
        authProfiles: {
          "reddit-main": {
            matchDomains: ["reddit.com"],
            proxy: {
              provider: "oxylabs",
              host: "isp.oxylabs.io",
              ports: [8008],
              username: "${OXYLABS_USER}",
              password: "${OXYLABS_PASS}",
            },
          },
        },
      };
      process.env.OXYLABS_USER = "user1";
      process.env.OXYLABS_PASS = "pass1";

      const config = mergeConfigWithEnv(jsonConfig);

      expect(config.authProfiles?.["reddit-main"]?.proxy).toEqual({
        provider: "oxylabs",
        host: "isp.oxylabs.io",
        ports: [8008],
        username: "user1",
        password: "pass1",
      });
    });
  });

  describe("enabledByDefault", () => {
    it("should default to false when not specified", () => {
      const config = mergeConfigWithEnv(null);
      expect(config.enabledByDefault).toBe(false);
    });

    it("should use enabledByDefault from JSON config when true", () => {
      const jsonConfig: Crawl4AIJsonConfig = {
        enabledByDefault: true,
      };

      const config = mergeConfigWithEnv(jsonConfig);
      expect(config.enabledByDefault).toBe(true);
    });

    it("should use enabledByDefault from JSON config when false", () => {
      const jsonConfig: Crawl4AIJsonConfig = {
        enabledByDefault: false,
      };

      const config = mergeConfigWithEnv(jsonConfig);
      expect(config.enabledByDefault).toBe(false);
    });

    it("should preserve enabledByDefault with other config options", () => {
      const jsonConfig: Crawl4AIJsonConfig = {
        url: "http://test:1234",
        timeoutMs: 30000,
        enabledByDefault: true,
        proxy: {
          url: "http://proxy:8080",
        },
      };

      const config = mergeConfigWithEnv(jsonConfig);
      expect(config.enabledByDefault).toBe(true);
      expect(config.baseUrl).toBe("http://test:1234");
      expect(config.timeout).toBe(30000);
      expect(config.proxyUrl).toBe("http://proxy:8080");
    });
  });
});
