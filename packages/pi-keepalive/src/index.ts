import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { KeepaliveController } from "./controller.js";
import {
	loadKeepaliveConfig,
	parseKeepaliveMode,
} from "./config.js";

export * from "./config.js";
export * from "./controller.js";

export default function keepaliveExtension(pi: ExtensionAPI): void {
	const config = loadKeepaliveConfig();
	const controller = new KeepaliveController(config);

	function showStatus(ctx: ExtensionCommandContext) {
		const status = controller.status();
		const limit = status.maxAttempts > 0 ? `/${status.maxAttempts}` : "/unlimited";
		const state = status.mode === "on-error"
			? status.waitingForError
				? "waiting to retry the last provider error"
				: "armed for the next provider error"
			: status.mode === "always"
				? "running continuously"
				: "disabled";
		ctx.ui.notify(
			`Keepalive: ${status.mode}; ${state}; attempts ${status.attempts}${limit}; timer ${status.timerActive ? "scheduled" : "idle"}`,
			"info",
		);
	}

	pi.registerCommand("keepalive", {
		description: "Retry provider errors or send a configurable message periodically",
		handler: async (args, ctx) => {
			const argument = (args ?? "").trim();
			if (!argument || argument === "status") {
				showStatus(ctx);
				return;
			}

			if (argument === "now") {
				if (!controller.sendNow()) {
					ctx.ui.notify("Keepalive could not send: the agent is busy or disabled", "warning");
				}
				return;
			}

			const mode = parseKeepaliveMode(argument);
			if (!mode) {
				ctx.ui.notify("Usage: /keepalive [status|now|on|on-error|off]", "warning");
				return;
			}

			controller.setMode(mode);
			ctx.ui.notify(
				mode === "always"
					? "Keepalive enabled: a message will be sent every configured interval"
					: mode === "on-error"
						? "Keepalive armed: it will retry after a provider error"
						: "Keepalive disabled",
				"info",
			);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		controller.setRuntime({
			isIdle: () => ctx.isIdle(),
			sendUserMessage: (message) => pi.sendUserMessage(message),
			notify: (message, level) => ctx.ui.notify(message, level),
		});
	});

	pi.on("agent_end", (event) => {
		controller.onAgentEnd(event.messages);
	});

	pi.on("agent_settled", () => {
		controller.onAgentSettled();
	});

	pi.on("session_shutdown", () => {
		controller.clearRuntime();
	});
}
