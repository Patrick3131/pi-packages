import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

import {
	activeNameFor,
	enabledToolNames,
	getXaiDefaultsConfigPaths,
	isXaiCompatibleProvider,
	loadXaiDefaultsConfig,
	XAI_TOOLS_MENU_CHANNEL,
} from "./config.js";

type BridgeResult = { ok: true } | { ok: false; error: string };

function commandContext(ctx: ExtensionContext): ExtensionCommandContext | undefined {
	if (!ctx.ui || typeof ctx.ui.notify !== "function") {
		return undefined;
	}
	return ctx as ExtensionCommandContext;
}

function quietCommandContext(ctx: ExtensionCommandContext): ExtensionCommandContext {
	const quietUi = new Proxy(ctx.ui, {
		get(target, prop, receiver) {
			if (prop === "notify") {
				return () => undefined;
			}
			return Reflect.get(target, prop, receiver);
		},
	});
	return new Proxy(ctx, {
		get(target, prop, receiver) {
			if (prop === "ui") {
				return quietUi;
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}

function enableThroughBridge(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	tool: string,
): Promise<BridgeResult> {
	const events = pi.events;
	if (!events || typeof events.emit !== "function") {
		return Promise.resolve({ ok: false, error: "pi.events is unavailable" });
	}

	return new Promise((resolve) => {
		let settled = false;
		const finish = (result: BridgeResult) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};
		const timer = setTimeout(() => {
			finish({ ok: false, error: `Timed out enabling ${tool}` });
		}, 2000);

		try {
			events.emit(XAI_TOOLS_MENU_CHANNEL, {
				action: "enable",
				tool,
				ctx,
				done: finish,
			});
		} catch (error) {
			finish({
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
}

async function enableDefaultXaiTools(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (existsSync(join(ctx.cwd, CONFIG_DIR_NAME, "tools.json"))) {
		return;
	}
	if (!isXaiCompatibleProvider(ctx.model?.provider)) {
		return;
	}
	const paths = getXaiDefaultsConfigPaths(ctx.cwd, getAgentDir(), CONFIG_DIR_NAME);
	const config = loadXaiDefaultsConfig(paths.globalPath, paths.projectPath);
	if (!config.enabled) {
		return;
	}
	const commandCtx = commandContext(ctx);
	if (!commandCtx) {
		return;
	}

	const tools = enabledToolNames(config);
	if (tools.length === 0) {
		return;
	}
	const active = new Set(pi.getActiveTools());
	const missing = tools.filter((tool) => !active.has(activeNameFor(tool)));
	if (missing.length === 0) {
		return;
	}

	const quietCtx = quietCommandContext(commandCtx);
	const failed: string[] = [];
	for (const tool of missing) {
		const result = await enableThroughBridge(pi, quietCtx, tool);
		if (!result.ok) {
			failed.push(tool);
		}
	}

	if (failed.length === missing.length) {
		ctx.ui.notify(
			"Could not default-enable xAI extras. Is pi-xai-oauth loaded? Use /xai-tools.",
			"warning",
		);
		return;
	}
	ctx.ui.notify("Enabled xAI extras for this Grok session.", "warning");
}

export default function xaiDefaultsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		await enableDefaultXaiTools(pi, ctx);
	});
	pi.on("model_select", async (_event, ctx) => {
		await enableDefaultXaiTools(pi, ctx);
	});
	pi.on("before_agent_start", async (_event, ctx) => {
		await enableDefaultXaiTools(pi, ctx);
	});
}
