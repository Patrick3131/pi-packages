export type KeepaliveMode = "on-error" | "always" | "off";

export interface KeepaliveConfig {
	/** Delay between automatic messages. */
	intervalMs: number;
	/** User message sent when the timer fires. */
	message: string;
	/** Start after provider errors, run continuously, or stay disabled. */
	mode: KeepaliveMode;
	/** Maximum automatic messages per session. Zero means unlimited. */
	maxAttempts: number;
}

export const DEFAULT_KEEPALIVE_CONFIG: KeepaliveConfig = {
	intervalMs: 10 * 60 * 1000,
	message: "continue",
	mode: "on-error",
	maxAttempts: 0,
};

function positiveInteger(value: string | undefined, fallback: number, minimum: number): number {
	if (value === undefined || value.trim() === "") return fallback;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

const MODE_ALIASES: Record<string, KeepaliveMode> = {
	always: "always",
	on: "always",
	off: "off",
	disabled: "off",
	"on-error": "on-error",
	error: "on-error",
	auto: "on-error",
	retry: "on-error",
};

/** Resolve a mode name from env or a /keepalive argument; unknown names yield undefined. */
export function parseKeepaliveMode(value: string | undefined): KeepaliveMode | undefined {
	return value === undefined ? undefined : MODE_ALIASES[value.trim().toLowerCase()];
}

/** Load generic settings without tying the extension to a provider or model. */
export function loadKeepaliveConfig(env: NodeJS.ProcessEnv = process.env): KeepaliveConfig {
	const message = env.PI_KEEPALIVE_MESSAGE?.trim();

	return {
		intervalMs: positiveInteger(
			env.PI_KEEPALIVE_INTERVAL_MS,
			DEFAULT_KEEPALIVE_CONFIG.intervalMs,
			1_000,
		),
		message: message || DEFAULT_KEEPALIVE_CONFIG.message,
		mode: parseKeepaliveMode(env.PI_KEEPALIVE_MODE) ?? DEFAULT_KEEPALIVE_CONFIG.mode,
		maxAttempts: positiveInteger(
			env.PI_KEEPALIVE_MAX_ATTEMPTS,
			DEFAULT_KEEPALIVE_CONFIG.maxAttempts,
			0,
		),
	};
}
