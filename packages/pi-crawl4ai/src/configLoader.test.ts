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
    expect(config.apiToken).toBeUndefined();
  });

  it("should resolve apiToken from CRAWL4AI_API_TOKEN env", () => {
    process.env.CRAWL4AI_API_TOKEN = "secret-from-env";
    const config = mergeConfigWithEnv(null);
    expect(config.apiToken).toBe("secret-from-env");
  });

  it("should resolve apiToken from JSON with env substitution", () => {
    process.env.CRAWL4AI_API_TOKEN = "secret-from-env";
    const config = mergeConfigWithEnv({
      apiToken: "${CRAWL4AI_API_TOKEN}",
    });
    expect(config.apiToken).toBe("secret-from-env");
  });

  it("should prefer JSON apiToken literal over env when not a substitution placeholder result empty", () => {
    process.env.CRAWL4AI_API_TOKEN = "env-token";
    const config = mergeConfigWithEnv({
      apiToken: "json-literal-token",
    });
    expect(config.apiToken).toBe("json-literal-token");
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

    it("should keep url and timeout when other options are set", () => {
      const jsonConfig: Crawl4AIJsonConfig = {
        url: "http://test:1234",
        timeoutMs: 30000,
      };

      const config = mergeConfigWithEnv(jsonConfig);
      expect(config.baseUrl).toBe("http://test:1234");
      expect(config.timeout).toBe(30000);
    });
  });
});
