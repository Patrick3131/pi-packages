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
  const originalPython = process.env.CRAWL4AI_TRAFILATURA_PYTHON;
  afterEach(() => {
    if (originalPython === undefined) delete process.env.CRAWL4AI_TRAFILATURA_PYTHON;
    else process.env.CRAWL4AI_TRAFILATURA_PYTHON = originalPython;
  });

  it("accepts exactly one optional Python path with JSON/env resolution", () => {
    process.env.CRAWL4AI_TRAFILATURA_PYTHON = "/env/python";
    expect(mergeConfigWithEnv(null).trafilatura?.pythonPath).toBe("/env/python");
    expect(mergeConfigWithEnv({ trafilatura: { pythonPath: "/json/python" } }).trafilatura?.pythonPath).toBe("/json/python");
    expect(mergeConfigWithEnv({ trafilatura: { pythonPath: "${CRAWL4AI_TRAFILATURA_PYTHON}" } }).trafilatura?.pythonPath).toBe("/env/python");
    delete process.env.CRAWL4AI_TRAFILATURA_PYTHON;
    expect(mergeConfigWithEnv(null).trafilatura?.pythonPath).toBeUndefined();
  });

  it.each([
    { timeoutMs: 0 }, { timeoutMs: NaN }, { minRequestIntervalMs: -1 },
    { tokenBudget: { maxCharsPerPage: -1 } }, { tokenBudget: { deepCrawlDefaultMaxPages: 1.5 } },
    { retention: { maxTotalMb: -1 } }, { retention: { maxSessions: 1.5 } },
    { url: "file:///tmp/server" }, { url: "http://user:secret@server" },
  ])("rejects invalid configured numbers/URL %j", config => {
    expect(() => mergeConfigWithEnv(config)).toThrow();
  });

  it("rejects malformed numeric environment values rather than silently using defaults", () => {
    process.env.CRAWL4AI_TIMEOUT = "30seconds";
    expect(() => mergeConfigWithEnv(null)).toThrow();
    process.env.CRAWL4AI_TIMEOUT = "30000";
    process.env.CRAWL4AI_MIN_REQUEST_INTERVAL_MS = "Infinity";
    expect(() => mergeConfigWithEnv(null)).toThrow();
  });

  it("normalizes service trailing slashes and preserves smaller legacy preview limits", () => {
    const config = mergeConfigWithEnv({ url: "https://server///", tokenBudget: { maxCharsPerPage: 100, maxCharsPerCall: 500 } });
    expect(config.baseUrl).toBe("https://server"); expect(config.tokenBudget.maxCharsPerPage).toBe(100); expect(config.tokenBudget.maxCharsPerCall).toBe(500);
    expect(mergeConfigWithEnv(null).tokenBudget.maxCharsPerCall).toBe(12000);
  });
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
