import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface RecapSettings {
	model?: string;
	auto?: boolean;
	dir?: string;
	retentionDays?: number;
}

export const DEFAULT_RETENTION_DAYS = 14;

export interface RecapPaths {
	dir: string;
	settingsPath: string;
}

export function resolveRecapPaths(agentDir: string, env: Record<string, string | undefined> = process.env): RecapPaths {
	const envDir = env.PI_RECAP_DIR?.trim();
	const dir = envDir ? resolve(envDir) : join(agentDir, "recaps");
	return { dir, settingsPath: join(dir, "settings.json") };
}

export function resolveRecapDir(paths: RecapPaths, settings: RecapSettings): string {
	const configured = settings.dir?.trim();
	if (!configured) return paths.dir;
	return isAbsolute(configured) ? configured : resolve(paths.dir, configured);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadRecapSettings(path: string): RecapSettings {
	if (!existsSync(path)) return {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
		if (!isRecord(parsed)) return {};
		const settings: RecapSettings = {};
		if (typeof parsed.model === "string" && parsed.model.trim()) settings.model = parsed.model.trim();
		if (typeof parsed.auto === "boolean") settings.auto = parsed.auto;
		if (typeof parsed.dir === "string" && parsed.dir.trim()) settings.dir = parsed.dir.trim();
		if (typeof parsed.retentionDays === "number" && Number.isFinite(parsed.retentionDays) && parsed.retentionDays >= 0) {
			settings.retentionDays = Math.floor(parsed.retentionDays);
		}
		return settings;
	} catch {
		return {};
	}
}

export function saveRecapSettings(path: string, settings: RecapSettings): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export function resolveRetentionDays(
	settings: RecapSettings,
	env: Record<string, string | undefined> = process.env,
): number {
	const fromEnv = env.PI_RECAP_RETENTION_DAYS?.trim();
	if (fromEnv) {
		const value = Number(fromEnv);
		if (Number.isFinite(value) && value >= 0) return Math.floor(value);
	}
	if (typeof settings.retentionDays === "number") return settings.retentionDays;
	return DEFAULT_RETENTION_DAYS;
}

/** Delete generated recap files older than the retention window. Never touches caches or settings. */
export function selectExpiredRecaps(
	files: readonly { name: string; mtimeMs: number }[],
	nowMs: number,
	retentionDays: number,
): string[] {
	if (!Number.isFinite(retentionDays) || retentionDays <= 0) return [];
	const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
	return files
		.filter((file) => /^recap-.+\.(?:html|txt)$/u.test(file.name) && file.mtimeMs < cutoff)
		.map((file) => file.name);
}

export function pruneRecapFiles(dir: string, retentionDays: number, nowMs = Date.now()): string[] {
	if (retentionDays <= 0 || !existsSync(dir)) return [];
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const files: { name: string; mtimeMs: number }[] = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		try {
			files.push({ name: entry.name, mtimeMs: statSync(join(dir, entry.name)).mtimeMs });
		} catch {
			// ignore unreadable files
		}
	}
	const deleted: string[] = [];
	for (const name of selectExpiredRecaps(files, nowMs, retentionDays)) {
		try {
			unlinkSync(join(dir, name));
			deleted.push(name);
		} catch {
			// ignore files that disappear mid-sweep
		}
	}
	return deleted;
}

export function resolveRecapModelSpec(
	settings: RecapSettings,
	env: Record<string, string | undefined> = process.env,
	flag?: string,
): string | undefined {
	const trimmedFlag = flag?.trim();
	if (trimmedFlag) return trimmedFlag;
	const envModel = env.PI_RECAP_MODEL?.trim();
	if (envModel) return envModel;
	return settings.model;
}

export function resolveAutoSetting(
	settings: RecapSettings,
	env: Record<string, string | undefined> = process.env,
): boolean {
	const envAuto = env.PI_RECAP_AUTO?.trim().toLowerCase();
	if (envAuto === "1" || envAuto === "true" || envAuto === "on") return true;
	if (envAuto === "0" || envAuto === "false" || envAuto === "off") return false;
	return settings.auto === true;
}

export function parseModelSpec(spec: string): { provider: string; id: string } | null {
	const slash = spec.indexOf("/");
	if (slash <= 0 || slash === spec.length - 1) return null;
	const provider = spec.slice(0, slash).trim();
	const id = spec.slice(slash + 1).trim();
	if (!provider || !id) return null;
	return { provider, id };
}

export function safeSessionId(sessionId: string): string {
	return sessionId.replace(/[^A-Za-z0-9._-]/gu, "_");
}
