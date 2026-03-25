/**
 * Tests for saveOutput functionality
 */

import {
  urlToFilePath,
  resolveOutputDir,
  getDefaultOutputDir,
  formatContentForSave,
  createSessionDirName,
  saveCrawlResults,
  DEFAULT_OUTPUT_DIR,
  OUTPUT_DIR_ENV_VAR,
} from "./saveOutput";
import type { CrawlResult, MarkdownGenerationResult } from "./types";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Test directory for file operations
const TEST_OUTPUT_DIR = "./__test_save_output__";

// Helper to clean up test directory
function cleanupTestDir() {
  try {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// Helper to check if directory exists
function dirExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

// Helper to read JSON file
function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("resolveOutputDir", () => {
  const originalEnv = process.env[OUTPUT_DIR_ENV_VAR];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[OUTPUT_DIR_ENV_VAR] = originalEnv;
    } else {
      delete process.env[OUTPUT_DIR_ENV_VAR];
    }
  });

  it("should return null for undefined", () => {
    expect(resolveOutputDir(undefined)).toBeNull();
  });

  it("should return null for false", () => {
    expect(resolveOutputDir(false)).toBeNull();
  });

  it("should return default dir for true", () => {
    expect(resolveOutputDir(true)).toBe(DEFAULT_OUTPUT_DIR);
  });

  it("should return custom path for string", () => {
    expect(resolveOutputDir("./custom-path")).toBe("./custom-path");
  });

  it("should respect CRAWL4AI_OUTPUT_DIR env var", () => {
    process.env[OUTPUT_DIR_ENV_VAR] = "./env-output-dir";
    expect(resolveOutputDir(true)).toBe("./env-output-dir");
  });

  it("should override env var with explicit string", () => {
    process.env[OUTPUT_DIR_ENV_VAR] = "./env-output-dir";
    expect(resolveOutputDir("./explicit-path")).toBe("./explicit-path");
  });
});

describe("getDefaultOutputDir", () => {
  const originalEnv = process.env[OUTPUT_DIR_ENV_VAR];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[OUTPUT_DIR_ENV_VAR] = originalEnv;
    } else {
      delete process.env[OUTPUT_DIR_ENV_VAR];
    }
  });

  it("should return default when env not set", () => {
    delete process.env[OUTPUT_DIR_ENV_VAR];
    expect(getDefaultOutputDir()).toBe(DEFAULT_OUTPUT_DIR);
  });

  it("should return env value when set", () => {
    process.env[OUTPUT_DIR_ENV_VAR] = "./custom-dir";
    expect(getDefaultOutputDir()).toBe("./custom-dir");
  });
});

describe("urlToFilePath", () => {
  describe("markdown format", () => {
    it("should convert root URL to index.md", () => {
      expect(urlToFilePath("https://example.com", "markdown")).toBe("example.com/index.md");
    });

    it("should convert root URL with trailing slash to index.md", () => {
      expect(urlToFilePath("https://example.com/", "markdown")).toBe("example.com/index.md");
    });

    it("should convert path URL to nested path", () => {
      expect(urlToFilePath("https://example.com/docs/api", "markdown")).toBe("example.com/docs/api.md");
    });

    it("should handle query strings", () => {
      const result = urlToFilePath("https://example.com/search?q=test&page=1", "markdown");
      expect(result).toContain("example.com/search");
      expect(result).toContain("q_test_page_1");
      expect(result).toMatch(/\.md$/);
    });

    it("should handle subdomains", () => {
      expect(urlToFilePath("https://docs.example.com/guide", "markdown")).toBe(
        "docs.example.com/guide.md"
      );
    });

    it("should handle trailing slash in path", () => {
      expect(urlToFilePath("https://example.com/docs/", "markdown")).toBe("example.com/docs.md");
    });

    it("should handle port numbers", () => {
      expect(urlToFilePath("http://localhost:3000/page", "markdown")).toBe(
        "localhost/page.md"
      );
    });
  });

  describe("html format", () => {
    it("should use .html extension", () => {
      expect(urlToFilePath("https://example.com", "html")).toBe("example.com/index.html");
    });

    it("should use .html extension for paths", () => {
      expect(urlToFilePath("https://example.com/docs/api", "html")).toBe("example.com/docs/api.html");
    });
  });

  describe("links format", () => {
    it("should use .md extension for links", () => {
      expect(urlToFilePath("https://example.com", "links")).toBe("example.com/index.md");
    });
  });

  describe("error handling", () => {
    it("should handle invalid URLs gracefully", () => {
      const result = urlToFilePath("not-a-valid-url", "markdown");
      expect(result).toMatch(/^unknown\/[a-zA-Z0-9_-]+\.md$/);
    });
  });
});

describe("formatContentForSave", () => {
  describe("successful results", () => {
    it("should return markdown content", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: true,
        markdown: "# Hello\n\nWorld",
      };

      expect(formatContentForSave(result, "markdown")).toBe("# Hello\n\nWorld");
    });

    it("should return markdown from MarkdownGenerationResult object", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: true,
        markdown: {
          raw_markdown: "# Raw markdown",
          markdown_with_citations: "# With citations",
          references_markdown: "## References",
        } as MarkdownGenerationResult,
      };

      expect(formatContentForSave(result, "markdown")).toBe("# Raw markdown");
    });

    it("should return html content", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: true,
        html: "<html><body>Test</body></html>",
      };

      expect(formatContentForSave(result, "html")).toBe("<html><body>Test</body></html>");
    });

    it("should return formatted links", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: true,
        links: {
          internal: [
            { href: "/about", text: "About" },
            { href: "/contact", text: "Contact" },
          ],
          external: [{ href: "https://other.com", text: "Other" }],
        },
      };

      const output = formatContentForSave(result, "links");
      expect(output).toContain("# Links from https://example.com");
      expect(output).toContain("## Internal Links (2)");
      expect(output).toContain("[About](/about)");
      expect(output).toContain("## External Links (1)");
      expect(output).toContain("[Other](https://other.com)");
    });

    it("should handle empty content gracefully", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: true,
      };

      expect(formatContentForSave(result, "markdown")).toBe("*No markdown content*");
      expect(formatContentForSave(result, "html")).toBe("<!-- No HTML content -->");
    });
  });

  describe("failed results", () => {
    it("should format error message", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: false,
        error_message: "404 Not Found",
      };

      const output = formatContentForSave(result, "markdown");
      expect(output).toContain("# Error: https://example.com");
      expect(output).toContain("404 Not Found");
    });

    it("should handle missing error message", () => {
      const result: CrawlResult = {
        url: "https://example.com",
        success: false,
      };

      const output = formatContentForSave(result, "markdown");
      expect(output).toContain("Unknown error");
    });
  });
});

describe("createSessionDirName", () => {
  it("should create directory name with domain and timestamp", () => {
    const timestamp = new Date("2025-03-25T14:30:00.000Z");
    const result = createSessionDirName("https://example.com/docs", timestamp);

    expect(result).toMatch(/^example\.com-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it("should handle subdomains", () => {
    const timestamp = new Date("2025-03-25T14:30:00.000Z");
    const result = createSessionDirName("https://docs.example.com", timestamp);

    expect(result).toMatch(/^docs\.example\.com-/);
  });

  it("should handle invalid URLs", () => {
    const timestamp = new Date("2025-03-25T14:30:00.000Z");
    const result = createSessionDirName("not-a-url", timestamp);

    expect(result).toMatch(/^unknown-/);
  });
});

describe("saveCrawlResults", () => {
  beforeEach(() => {
    cleanupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  it("should create session directory with manifest", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com",
        success: true,
        markdown: "# Home",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      false
    );

    expect(dirExists(sessionPath)).toBe(true);
    expect(dirExists(join(sessionPath, "crawl-manifest.json"))).toBe(true);
    expect(dirExists(join(sessionPath, "example.com/index.md"))).toBe(true);
  });

  it("should save multiple pages", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com",
        success: true,
        markdown: "# Home",
      },
      {
        url: "https://example.com/docs",
        success: true,
        markdown: "# Docs",
      },
      {
        url: "https://example.com/api/users",
        success: true,
        markdown: "# API Users",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      false
    );

    expect(dirExists(join(sessionPath, "example.com/index.md"))).toBe(true);
    expect(dirExists(join(sessionPath, "example.com/docs.md"))).toBe(true);
    expect(dirExists(join(sessionPath, "example.com/api/users.md"))).toBe(true);
  });

  it("should create valid manifest", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com",
        success: true,
        markdown: "# Home",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      true
    );

    const manifest = readJsonFile(join(sessionPath, "crawl-manifest.json")) as any;

    expect(manifest.totalPages).toBe(1);
    expect(manifest.format).toBe("markdown");
    expect(manifest.urls).toEqual(["https://example.com"]);
    expect(manifest.proxyUsed).toBe(true);
    expect(manifest.files).toHaveLength(1);
    expect(manifest.timestamp).toBeDefined();
  });

  it("should include deep crawl info in manifest", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com",
        success: true,
        markdown: "# Home",
        metadata: { depth: 0 },
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      false,
      { maxDepth: 3, maxPages: 50 }
    );

    const manifest = readJsonFile(join(sessionPath, "crawl-manifest.json")) as any;

    expect(manifest.deepCrawl).toBeDefined();
    expect(manifest.deepCrawl.maxDepth).toBe(3);
    expect(manifest.deepCrawl.maxPages).toBe(50);
  });

  it("should save HTML format with correct extension", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com",
        success: true,
        html: "<html></html>",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "html",
      false
    );

    expect(dirExists(join(sessionPath, "example.com/index.html"))).toBe(true);
  });

  it("should save content to files", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com",
        success: true,
        markdown: "# Hello World\n\nThis is the content.",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      false
    );

    const content = readFileSync(join(sessionPath, "example.com/index.md"), "utf-8");
    expect(content).toBe("# Hello World\n\nThis is the content.");
  });

  it("should handle failed crawls", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com/broken",
        success: false,
        error_message: "404 Not Found",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      false
    );

    const content = readFileSync(join(sessionPath, "example.com/broken.md"), "utf-8");
    expect(content).toContain("# Error:");
    expect(content).toContain("404 Not Found");
  });

  it("should handle nested paths", () => {
    const results: CrawlResult[] = [
      {
        url: "https://example.com/a/b/c/d",
        success: true,
        markdown: "# Deep page",
      },
    ];

    const sessionPath = saveCrawlResults(
      TEST_OUTPUT_DIR,
      ["https://example.com"],
      results,
      "markdown",
      false
    );

    expect(dirExists(join(sessionPath, "example.com/a/b/c/d.md"))).toBe(true);
  });
});
