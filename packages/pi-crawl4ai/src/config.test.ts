/**
 * Tests for config module
 */

import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig } from "./config";
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
  it("loads JSON configuration without unsolicited stdout or exposing bearer values", () => {
    const configPath = join(tempDir, "crawl4ai.json");
    writeFileSync(configPath, JSON.stringify({ url: "https://service.example/", apiToken: "test-secret", timeoutMs: 45000 }));
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const config = loadConfig({ cwd: tempDir });
      expect(config.baseUrl).toBe("https://service.example"); expect(config.apiToken).toBe("test-secret"); expect(config.timeout).toBe(45000);
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); rmSync(configPath); }
  });
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

  it("does not accept client-side proxy settings", () => {
    process.env.OXYLABS_USER = "testuser";
    process.env.OXYLABS_PASS = "testpass";
    process.env.CRAWL4AI_PROXY_URL = "http://user:pass@proxy.example.com:8080";

    const config = loadConfig({ cwd: tempDir });

    expect(config).not.toHaveProperty("proxy_config");
    expect(config.raw).not.toHaveProperty("proxy_config");
  });
});
