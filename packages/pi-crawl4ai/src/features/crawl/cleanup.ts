/**
 * Retention / cleanup for saved crawl session directories.
 *
 * Only deletes directories that look like crawl sessions (contain
 * crawl-manifest.json) under the given output root.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

export interface RetentionPolicy {
  /** Run cleanup automatically after saves. Default true. */
  enabled: boolean;
  /** Keep at most this many newest sessions. Default 20. */
  maxSessions: number;
  /** Delete sessions older than this many days. Default 7. 0 = disable age rule. */
  maxAgeDays: number;
  /** Soft cap on total size of all sessions in MB. Default 512. 0 = disable. */
  maxTotalMb: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  enabled: true,
  maxSessions: 20,
  maxAgeDays: 7,
  maxTotalMb: 512,
};

export interface CrawlSessionInfo {
  path: string;
  name: string;
  mtimeMs: number;
  sizeBytes: number;
  timestamp?: string;
}

export interface CleanupResult {
  outputDir: string;
  scanned: number;
  deleted: string[];
  kept: number;
  freedBytes: number;
  reasons: Record<string, string>;
}

const MANIFEST_NAME = "crawl-manifest.json";

function directorySizeBytes(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          total += statSync(full).size;
        }
      } catch {
        // Ignore races / permission errors on individual files
      }
    }
  }
  return total;
}

function readManifestTimestamp(sessionDir: string): string | undefined {
  const manifestPath = join(sessionDir, MANIFEST_NAME);
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as { timestamp?: unknown };
    return typeof parsed.timestamp === "string" ? parsed.timestamp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * List crawl session directories under outputDir (immediate children with a manifest).
 */
export function listCrawlSessions(outputDir: string): CrawlSessionInfo[] {
  if (!existsSync(outputDir)) return [];

  let entries;
  try {
    entries = readdirSync(outputDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessions: CrawlSessionInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionPath = join(outputDir, entry.name);
    const manifestPath = join(sessionPath, MANIFEST_NAME);
    if (!existsSync(manifestPath)) continue;

    let mtimeMs = 0;
    try {
      mtimeMs = statSync(sessionPath).mtimeMs;
    } catch {
      continue;
    }

    const timestamp = readManifestTimestamp(sessionPath);
    if (timestamp) {
      const parsed = Date.parse(timestamp);
      if (!Number.isNaN(parsed)) mtimeMs = parsed;
    }

    sessions.push({
      path: sessionPath,
      name: entry.name,
      mtimeMs,
      sizeBytes: directorySizeBytes(sessionPath),
      timestamp,
    });
  }

  // Newest first
  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sessions;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Apply retention policy to crawl sessions under outputDir.
 * Safe: only removes dirs containing crawl-manifest.json.
 */
export function cleanupCrawlSessions(
  outputDir: string,
  policy: RetentionPolicy,
  options?: { now?: Date; dryRun?: boolean }
): CleanupResult {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun === true;
  const sessions = listCrawlSessions(outputDir);
  const toDelete = new Map<string, string>(); // path -> reason

  // Age-based
  if (policy.maxAgeDays > 0) {
    const cutoff = now.getTime() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
    for (const session of sessions) {
      if (session.mtimeMs < cutoff) {
        toDelete.set(session.path, `older than ${policy.maxAgeDays}d`);
      }
    }
  }

  // Count-based (keep newest maxSessions among not-yet-deleted)
  if (policy.maxSessions > 0) {
    const remaining = sessions.filter((s) => !toDelete.has(s.path));
    if (remaining.length > policy.maxSessions) {
      for (const session of remaining.slice(policy.maxSessions)) {
        toDelete.set(session.path, `exceeded maxSessions=${policy.maxSessions}`);
      }
    }
  }

  // Size-based (delete oldest first among survivors until under cap)
  if (policy.maxTotalMb > 0) {
    const maxBytes = policy.maxTotalMb * 1024 * 1024;
    const remaining = sessions
      .filter((s) => !toDelete.has(s.path))
      .sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
    let total = remaining.reduce((sum, s) => sum + s.sizeBytes, 0);
    // Delete from oldest
    for (let i = remaining.length - 1; i >= 0 && total > maxBytes; i--) {
      const session = remaining[i];
      toDelete.set(session.path, `exceeded maxTotalMb=${policy.maxTotalMb}`);
      total -= session.sizeBytes;
    }
  }

  const deleted: string[] = [];
  const reasons: Record<string, string> = {};
  let freedBytes = 0;

  for (const session of sessions) {
    const reason = toDelete.get(session.path);
    if (!reason) continue;
    reasons[session.name] = reason;
    freedBytes += session.sizeBytes;
    if (!dryRun) {
      try {
        rmSync(session.path, { recursive: true, force: true });
        deleted.push(session.name);
      } catch {
        // Leave it if delete fails; don't count as deleted
        delete reasons[session.name];
        freedBytes -= session.sizeBytes;
      }
    } else {
      deleted.push(session.name);
    }
  }

  return {
    outputDir,
    scanned: sessions.length,
    deleted,
    kept: sessions.length - deleted.length,
    freedBytes,
    reasons,
  };
}

export function formatCleanupSummary(result: CleanupResult, dryRun = false): string {
  const action = dryRun ? "Would delete" : "Deleted";
  if (result.deleted.length === 0) {
    return `Crawl cleanup: scanned ${result.scanned} session(s) in ${result.outputDir}; nothing to remove.`;
  }
  const lines = [
    `Crawl cleanup${dryRun ? " (dry-run)" : ""}: scanned ${result.scanned}, ${action.toLowerCase()} ${result.deleted.length}, kept ${result.kept}, freed ${formatBytes(result.freedBytes)}`,
    `Root: ${result.outputDir}`,
    ...result.deleted.map((name) => `- ${action} ${name} (${result.reasons[name] ?? "policy"})`),
  ];
  return lines.join("\n");
}
