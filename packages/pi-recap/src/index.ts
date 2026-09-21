import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { parseRecapArgs, RECAP_HELP } from "./args.js";
import {
	loadRecapSettings,
	parseModelSpec,
	pruneRecapFiles,
	resolveAutoSetting,
	resolveRecapDir,
	resolveRecapModelSpec,
	resolveRecapPaths,
	resolveRetentionDays,
	safeSessionId,
	saveRecapSettings,
} from "./config.js";
import { buildDocument, type SummaryReport } from "./document.js";
import { renderRecapHtml } from "./html.js";
import { readSessionFile, sessionFromBranch, type RecapSession, type SessionEntry } from "./session.js";
import {
	applySummaries,
	loadSummaryCache,
	runSummarize,
	saveSummaryCache,
	type RecapModelInfo,
	type RecapModelRegistryLike,
	type SummaryEstimate,
} from "./summarize.js";
import { formatCount, formatUsd } from "./text.js";
import { renderRecapText } from "./text-report.js";

const DEFAULT_PREVIEW_CHARS = 320;

let autoBusy = false;

export function resolveRecapModel(
	ctx: Pick<ExtensionContext, "model" | "modelRegistry">,
	spec?: string,
): RecapModelInfo | undefined {
	const registry = ctx.modelRegistry as unknown as RecapModelRegistryLike;
	if (spec) {
		const parsed = parseModelSpec(spec);
		if (!parsed || typeof registry.find !== "function") return undefined;
		return registry.find(parsed.provider, parsed.id);
	}
	return (ctx.model as RecapModelInfo | undefined) ?? undefined;
}

export function resolveRecapSession(
	ctx: Pick<ExtensionCommandContext, "sessionManager" | "cwd">,
): RecapSession {
	const file = ctx.sessionManager.getSessionFile();
	if (file) {
		try {
			return readSessionFile(file);
		} catch {
			// fall through to the live branch
		}
	}
	return sessionFromBranch(ctx.sessionManager.getBranch() as unknown as SessionEntry[], {
		sessionId: ctx.sessionManager.getSessionId(),
		cwd: ctx.cwd,
	});
}

function recapOutputPath(dir: string, sessionId: string, extension: "html" | "txt"): string {
	mkdirSync(dir, { recursive: true });
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/gu, "")
		.replace(/\.\d+Z$/u, "")
		.replace("T", "-");
	return join(dir, `recap-${safeSessionId(sessionId).slice(0, 12)}-${stamp}.${extension}`);
}

async function openInBrowser(pi: ExtensionAPI, file: string): Promise<void> {
	try {
		if (process.platform === "darwin") await pi.exec("open", [file]);
		else if (process.platform === "win32") await pi.exec("cmd", ["/c", "start", "", file]);
		else await pi.exec("xdg-open", [file]);
	} catch {
		// A missing browser must not fail the recap.
	}
}

async function summarizeSession(
	ctx: ExtensionCommandContext,
	session: RecapSession,
	dir: string,
	args: ReturnType<typeof parseRecapArgs>,
	settings: ReturnType<typeof loadRecapSettings>,
): Promise<SummaryReport | undefined> {
	const spec = resolveRecapModelSpec(settings, process.env, args.model);
	const model = resolveRecapModel(ctx, spec);
	if (!model) {
		ctx.ui.notify(
			spec
				? `Recap: model not found: ${spec}`
				: "Recap: no active model; pass --model provider/id or set PI_RECAP_MODEL",
			"warning",
		);
		return undefined;
	}

	const cachePath = join(dir, `summary-${safeSessionId(session.sessionId)}.json`);
	const cache = loadSummaryCache(cachePath);
	const registry = ctx.modelRegistry as unknown as RecapModelRegistryLike;
	const confirm =
		args.yes || !ctx.hasUI
			? undefined
			: async (estimate: SummaryEstimate): Promise<boolean> =>
					ctx.ui.confirm(
						"Summarize recap",
						`${estimate.exchanges} exchange(s), ~${formatCount(estimate.inputTokens)} input tokens, est. ${formatUsd(
							estimate.costUsd,
						)} with ${model.provider}/${model.id}. Continue?`,
					);

	const { cache: next, report } = await runSummarize({
		exchanges: session.exchanges,
		cache,
		model,
		registry,
		confirm,
		sessionId: session.sessionId,
		signal: ctx.signal,
	});
	saveSummaryCache(cachePath, next);
	applySummaries(session.exchanges, next);

	if (report.status === "failed") {
		ctx.ui.notify(`Recap summaries failed, showing truncated answers: ${report.error ?? "unknown error"}`, "warning");
	} else if (report.summarized > 0) {
		ctx.ui.notify(
			`Summarized ${formatCount(report.summarized)} exchange(s) with ${report.model}${
				report.costUsd > 0 ? ` (${formatUsd(report.costUsd)})` : ""
			}.`,
			"info",
		);
	}
	return report;
}

export async function handleRecapCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const args = parseRecapArgs(rawArgs);
	if (args.errors.length > 0) {
		ctx.ui.notify(`/recap: ${args.errors.join("; ")}`, "error");
		return;
	}
	if (args.help) {
		ctx.ui.notify(RECAP_HELP, "info");
		return;
	}

	const paths = resolveRecapPaths(getAgentDir());
	const settings = loadRecapSettings(paths.settingsPath);

	if (args.auto) {
		if (args.auto === "status") {
			const enabled = resolveAutoSetting(settings) ? "on" : "off";
			ctx.ui.notify(`Recap auto summaries: ${enabled}${settings.model ? ` (${settings.model})` : ""}`, "info");
			return;
		}
		saveRecapSettings(paths.settingsPath, { ...settings, auto: args.auto === "on" });
		ctx.ui.notify(`Recap auto summaries ${args.auto === "on" ? "enabled" : "disabled"}.`, "info");
		return;
	}

	try {
		const session = resolveRecapSession(ctx);
		if (args.limit !== undefined) session.exchanges = session.exchanges.slice(-args.limit);

		const dir = resolveRecapDir(paths, settings);
		if (args.messages && args.summarize) {
			ctx.ui.notify("Recap: --messages shows the plain transcript, so --summarize is ignored.", "warning");
		}
		const summary =
			!args.messages && args.summarize ? await summarizeSession(ctx, session, dir, args, settings) : undefined;

		const previewChars =
			args.messages || args.full ? Number.POSITIVE_INFINITY : (args.preview ?? DEFAULT_PREVIEW_CHARS);
		const document = buildDocument(session, previewChars, { messages: args.messages });
		if (summary) document.summary = summary;

		const retentionDays = resolveRetentionDays(settings);
		const pruned = pruneRecapFiles(dir, retentionDays);
		if (pruned.length > 0) {
			ctx.ui.notify(
				`Cleaned up ${formatCount(pruned.length)} recap file(s) older than ${retentionDays} day(s).`,
				"info",
			);
		}

		if (args.text) {
			const file = recapOutputPath(dir, session.sessionId, "txt");
			writeFileSync(file, renderRecapText(document), "utf-8");
			ctx.ui.notify(`${args.messages ? "Messages" : "Recap"} (text): ${file}`, "info");
			return;
		}

		const file = recapOutputPath(dir, session.sessionId, "html");
		writeFileSync(file, renderRecapHtml(document), "utf-8");
		const costNote = summary && summary.costUsd > 0 ? `, ${formatUsd(summary.costUsd)}` : "";
		ctx.ui.notify(
			`${args.messages ? "Messages" : "Recap"}: ${file} (${formatCount(session.exchanges.length)} exchanges${costNote})`,
			"info",
		);
		if (args.open) await openInBrowser(pi, file);
	} catch (error) {
		ctx.ui.notify(`/recap failed: ${error instanceof Error ? error.message : String(error)}`, "error");
	}
}

export async function autoSummarize(ctx: ExtensionContext): Promise<void> {
	if (autoBusy) return;
	const paths = resolveRecapPaths(getAgentDir());
	const settings = loadRecapSettings(paths.settingsPath);
	if (!resolveAutoSetting(settings)) return;
	const file = ctx.sessionManager.getSessionFile();
	if (!file) return;

	autoBusy = true;
	try {
		const session = readSessionFile(file);
		if (session.exchanges.length === 0) return;
		const spec = resolveRecapModelSpec(settings, process.env, undefined);
		const model = resolveRecapModel(ctx, spec);
		if (!model) return;

		const dir = resolveRecapDir(paths, settings);
		const cachePath = join(dir, `summary-${safeSessionId(session.sessionId)}.json`);
		const cache = loadSummaryCache(cachePath);
		const registry = ctx.modelRegistry as unknown as RecapModelRegistryLike;
		const { cache: next, report } = await runSummarize({
			exchanges: session.exchanges,
			cache,
			model,
			registry,
			sessionId: session.sessionId,
		});
		if (report.status === "failed") {
			ctx.ui.notify(`Recap auto summary failed: ${report.error ?? "unknown error"}`, "warning");
			return;
		}
		if (report.summarized > 0) saveSummaryCache(cachePath, next);
	} catch {
		// Auto summarization is best-effort background work.
	} finally {
		autoBusy = false;
	}
}

export default function recapExtension(pi: ExtensionAPI): void {
	const handler = (rawArgs: string, ctx: ExtensionCommandContext): Promise<void> =>
		handleRecapCommand(pi, rawArgs, ctx);

	for (const name of ["recap", "user-messages"]) {
		pi.registerCommand(name, {
			description: "Recap this session as user questions with short, expandable answers",
			handler,
		});
	}

	pi.on("turn_end", async (_event, ctx) => {
		await autoSummarize(ctx);
	});
}
