import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const XAI_TOOLS_MENU_CHANNEL = "pi-clickable-menu:xai-tools";

export const XAI_NETWORK_TOOL_NAMES = [
	"xai_grok_web_search",
	"xai_generate_text",
	"xai_x_search",
	"xai_multi_agent",
	"xai_deep_research",
	"xai_code_execution",
	"xai_generate_image",
	"xai_edit_image",
	"xai_image_to_video",
	"xai_analyze_image",
	"xai_critique",
] as const;

const ENABLE_ALIASES: Record<string, string> = {
	xai_grok_web_search: "web_search",
};

type BridgeResult = { ok: true } | { ok: false; error: string };

export function isXaiNetworkTool(name: string): boolean {
	return (XAI_NETWORK_TOOL_NAMES as readonly string[]).includes(name);
}

export function xaiEnableName(name: string): string {
	return ENABLE_ALIASES[name] ?? name;
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

export async function enableXaiNetworkTools(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	toolNames: string[],
): Promise<string[]> {
	const extras = toolNames.filter(isXaiNetworkTool);
	if (extras.length === 0) {
		return [];
	}

	const quietCtx = quietCommandContext(ctx);
	const failed: string[] = [];
	for (const name of extras) {
		const result = await enableThroughBridge(pi, quietCtx, xaiEnableName(name));
		if (!result.ok) {
			failed.push(name);
		}
	}
	return failed;
}
