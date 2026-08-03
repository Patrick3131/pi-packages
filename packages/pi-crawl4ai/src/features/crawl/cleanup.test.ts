/**
 * Tests for crawl session retention / cleanup.
 */

import { mkdirSync, writeFileSync, existsSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupCrawlSessions,
  formatCleanupSummary,
  listCrawlSessions,
  type RetentionPolicy,
} from "./cleanup";

const TEST_ROOT = "./__test_crawl_cleanup__";

function cleanupRoot() {
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function writeSession(
  name: string,
  options?: { timestamp?: string; bodyBytes?: number; mtimeMs?: number }
) {
  const dir = join(TEST_ROOT, name);
  mkdirSync(dir, { recursive: true });
  const timestamp = options?.timestamp ?? new Date().toISOString();
  writeFileSync(
    join(dir, "crawl-manifest.json"),
    JSON.stringify({
      timestamp,
      totalPages: 1,
      format: "markdown",
      urls: ["https://example.com"],
      files: ["example.com/index.md"],
    }),
    "utf-8"
  );
  const pageDir = join(dir, "example.com");
  mkdirSync(pageDir, { recursive: true });
  const body = "x".repeat(options?.bodyBytes ?? 100);
  writeFileSync(join(pageDir, "index.md"), body, "utf-8");
  if (options?.mtimeMs !== undefined) {
    const atime = new Date(options.mtimeMs);
    const mtime = new Date(options.mtimeMs);
    utimesSync(dir, atime, mtime);
  }
  return dir;
}

describe("listCrawlSessions", () => {
  beforeEach(cleanupRoot);
  afterEach(cleanupRoot);

  it("returns only directories with crawl-manifest.json, newest first", () => {
    writeSession("old-session", {
      timestamp: "2020-01-01T00:00:00.000Z",
    });
    writeSession("new-session", {
      timestamp: "2024-06-01T00:00:00.000Z",
    });
    mkdirSync(join(TEST_ROOT, "not-a-session"), { recursive: true });
    writeFileSync(join(TEST_ROOT, "not-a-session", "readme.txt"), "nope");

    const sessions = listCrawlSessions(TEST_ROOT);
    expect(sessions.map((s) => s.name)).toEqual(["new-session", "old-session"]);
    expect(sessions[0].timestamp).toBe("2024-06-01T00:00:00.000Z");
  });

  it("returns empty for missing directory", () => {
    expect(listCrawlSessions(join(TEST_ROOT, "missing"))).toEqual([]);
  });
});

describe("cleanupCrawlSessions", () => {
  beforeEach(cleanupRoot);
  afterEach(cleanupRoot);

  const basePolicy: RetentionPolicy = {
    enabled: true,
    maxSessions: 100,
    maxAgeDays: 0,
    maxTotalMb: 0,
  };

  it("deletes sessions older than maxAgeDays", () => {
    writeSession("ancient", { timestamp: "2020-01-01T00:00:00.000Z" });
    writeSession("fresh", { timestamp: "2024-06-15T00:00:00.000Z" });

    const result = cleanupCrawlSessions(
      TEST_ROOT,
      { ...basePolicy, maxAgeDays: 7 },
      { now: new Date("2024-06-20T00:00:00.000Z") }
    );

    expect(result.deleted).toEqual(["ancient"]);
    expect(result.kept).toBe(1);
    expect(existsSync(join(TEST_ROOT, "ancient"))).toBe(false);
    expect(existsSync(join(TEST_ROOT, "fresh"))).toBe(true);
    expect(result.reasons.ancient).toContain("older than 7d");
  });

  it("keeps only the newest maxSessions", () => {
    writeSession("s1", { timestamp: "2024-01-01T00:00:00.000Z" });
    writeSession("s2", { timestamp: "2024-01-02T00:00:00.000Z" });
    writeSession("s3", { timestamp: "2024-01-03T00:00:00.000Z" });

    const result = cleanupCrawlSessions(TEST_ROOT, {
      ...basePolicy,
      maxSessions: 2,
    });

    expect(result.deleted.sort()).toEqual(["s1"]);
    expect(existsSync(join(TEST_ROOT, "s3"))).toBe(true);
    expect(existsSync(join(TEST_ROOT, "s2"))).toBe(true);
    expect(existsSync(join(TEST_ROOT, "s1"))).toBe(false);
  });

  it("enforces maxTotalMb by deleting oldest first", () => {
    // ~0.6 MB each roughly
    writeSession("big-old", {
      timestamp: "2024-01-01T00:00:00.000Z",
      bodyBytes: 600_000,
    });
    writeSession("big-new", {
      timestamp: "2024-01-02T00:00:00.000Z",
      bodyBytes: 600_000,
    });

    const result = cleanupCrawlSessions(TEST_ROOT, {
      ...basePolicy,
      maxTotalMb: 1, // 1 MB total
    });

    expect(result.deleted).toEqual(["big-old"]);
    expect(existsSync(join(TEST_ROOT, "big-new"))).toBe(true);
    expect(existsSync(join(TEST_ROOT, "big-old"))).toBe(false);
    expect(result.freedBytes).toBeGreaterThan(500_000);
  });

  it("dry-run does not delete files", () => {
    writeSession("old", { timestamp: "2020-01-01T00:00:00.000Z" });

    const result = cleanupCrawlSessions(
      TEST_ROOT,
      { ...basePolicy, maxAgeDays: 1 },
      { now: new Date("2024-01-01T00:00:00.000Z"), dryRun: true }
    );

    expect(result.deleted).toEqual(["old"]);
    expect(existsSync(join(TEST_ROOT, "old"))).toBe(true);
  });

  it("ignores non-session directories", () => {
    mkdirSync(join(TEST_ROOT, "scratch"), { recursive: true });
    writeFileSync(join(TEST_ROOT, "scratch", "notes.txt"), "keep me");
    writeSession("old", { timestamp: "2020-01-01T00:00:00.000Z" });

    cleanupCrawlSessions(
      TEST_ROOT,
      { ...basePolicy, maxAgeDays: 1 },
      { now: new Date("2024-01-01T00:00:00.000Z") }
    );

    expect(existsSync(join(TEST_ROOT, "scratch", "notes.txt"))).toBe(true);
    expect(existsSync(join(TEST_ROOT, "old"))).toBe(false);
  });
});

describe("formatCleanupSummary", () => {
  it("describes no-op cleanups", () => {
    const text = formatCleanupSummary({
      outputDir: TEST_ROOT,
      scanned: 3,
      deleted: [],
      kept: 3,
      freedBytes: 0,
      reasons: {},
    });
    expect(text).toContain("nothing to remove");
    expect(text).toContain("scanned 3");
  });

  it("lists deleted sessions", () => {
    const text = formatCleanupSummary({
      outputDir: TEST_ROOT,
      scanned: 2,
      deleted: ["old-session"],
      kept: 1,
      freedBytes: 2048,
      reasons: { "old-session": "older than 7d" },
    });
    expect(text).toContain("deleted 1");
    expect(text).toContain("Deleted old-session");
    expect(text).toContain("older than 7d");
  });
});
