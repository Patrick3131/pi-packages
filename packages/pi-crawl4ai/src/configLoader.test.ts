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
    expect(config.proxyUrl).toBeUndefined();
  });

  it("should use env vars when no JSON config", () => {
    process.env.CRAWL4AI_BASE_URL = "http://env:9999";
    process.env.CRAWL4AI_TIMEOUT = "45000";

    const config = mergeConfigWithEnv(null);

    expect(config.baseUrl).toBe("http://env:9999");
    expect(config.timeout).toBe(45000);
  });

  it("should prefer JSON config over env vars", () => {
    process.env.CRAWL4AI_BASE_URL = "http://env:9999";
    process.env.CRAWL4AI_TIMEOUT = "45000";

    const jsonConfig: Crawl4AIJsonConfig = {
      url: "http://json:8888",
      timeoutMs: 30000,
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.baseUrl).toBe("http://json:8888");
    expect(config.timeout).toBe(30000);
  });

  it("should use env vars for missing JSON fields", () => {
    process.env.CRAWL4AI_BASE_URL = "http://env:9999";

    const jsonConfig: Crawl4AIJsonConfig = {
      timeoutMs: 30000,
    };

    const config = mergeConfigWithEnv(jsonConfig);

    expect(config.baseUrl).toBe("http://env:9999");
    expect(config.timeout).toBe(30000);
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
});
