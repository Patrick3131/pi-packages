import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnvFile(cwd?: string): void {
  const envPath = join(cwd || process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn(`[pi-crawl4ai] Failed to load .env file: ${String(error)}`);
  }
}

export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] || "");
}

export function resolveJsonValue<T>(value: T): T {
  if (typeof value === "string") return resolveEnvVars(value) as T;
  if (Array.isArray(value)) return value.map((item) => resolveJsonValue(item)) as T;
  if (!value || typeof value !== "object") return value;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => [key, resolveJsonValue(entryValue)]);
  return Object.fromEntries(entries) as T;
}
