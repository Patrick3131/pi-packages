import type { KeepaliveConfig, KeepaliveMode } from "./config.js";

export interface KeepaliveRuntime {
	isIdle: () => boolean;
	sendUserMessage: (message: string) => void;
	notify?: (message: string, level: "info" | "warning" | "error") => void;
}

export interface KeepaliveStatus {
	mode: KeepaliveMode;
	attempts: number;
	maxAttempts: number;
	waitingForError: boolean;
	timerActive: boolean;
}

export function hasAssistantError(messages: readonly unknown[]): boolean {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (!message || typeof message !== "object") continue;
		const candidate = message as { role?: unknown; stopReason?: unknown };
		if (candidate.role !== "assistant") continue;
		return candidate.stopReason === "error";
	}
	return false;
}

/**
 * Schedules user-message retries without knowing anything about the provider.
 * It deliberately uses one-shot timers so a slow request cannot overlap another.
 */
export class KeepaliveController {
	private readonly config: KeepaliveConfig;
	private runtime: KeepaliveRuntime | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private waitingForError = false;
	private attempts = 0;
	private running = false;

	constructor(config: KeepaliveConfig) {
		this.config = config;
		this.running = config.mode !== "off";
	}

	setRuntime(runtime: KeepaliveRuntime): void {
		this.runtime = runtime;
		if (this.running && this.config.mode === "always") this.schedule();
	}

	clearRuntime(): void {
		this.stopTimer();
		this.runtime = undefined;
	}

	setMode(mode: KeepaliveMode): void {
		this.stopTimer();
		this.waitingForError = false;
		this.attempts = 0;
		this.running = mode !== "off";
		this.config.mode = mode;
		if (mode === "always") this.schedule();
	}

	sendNow(): boolean {
		if (!this.runtime || !this.runtime.isIdle()) return false;
		return this.fire();
	}

	onAgentEnd(messages: readonly unknown[]): void {
		if (!this.running || this.config.mode !== "on-error") return;
		if (hasAssistantError(messages)) {
			this.waitingForError = true;
			return;
		}

		// A successful or user-aborted run ends error recovery.
		this.waitingForError = false;
		this.stopTimer();
	}

	onAgentSettled(): void {
		if (!this.running) return;
		if (this.config.mode === "always" || this.waitingForError) this.schedule();
	}

	status(): KeepaliveStatus {
		return {
			mode: this.config.mode,
			attempts: this.attempts,
			maxAttempts: this.config.maxAttempts,
			waitingForError: this.waitingForError,
			timerActive: this.timer !== undefined,
		};
	}

	dispose(): void {
		this.running = false;
		this.waitingForError = false;
		this.clearRuntime();
	}

	private schedule(): void {
		if (!this.running || this.timer || !this.runtime) return;
		if (this.config.mode === "on-error" && !this.waitingForError) return;
		if (this.config.maxAttempts > 0 && this.attempts >= this.config.maxAttempts) {
			this.runtime.notify?.(
				`Keepalive stopped after ${this.config.maxAttempts} automatic attempt(s).`,
				"warning",
			);
			return;
		}

		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.fire();
		}, this.config.intervalMs);
		// Do not keep non-interactive `pi -p` processes alive solely for a timer.
		this.timer.unref?.();
	}

	private fire(): boolean {
		const runtime = this.runtime;
		if (!runtime || !this.running) return false;
		if (!runtime.isIdle()) {
			this.schedule();
			return false;
		}

		this.attempts += 1;
		try {
			runtime.sendUserMessage(this.config.message);
			runtime.notify?.(`Keepalive sent: ${this.config.message}`, "info");
			return true;
		} catch (error) {
			runtime.notify?.(
				`Keepalive could not send a message: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			this.schedule();
			return false;
		}
	}

	private stopTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}
}
