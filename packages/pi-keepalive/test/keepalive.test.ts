import assert from "node:assert/strict";
import test from "node:test";

import { KeepaliveController, hasAssistantError } from "../src/controller.js";
import {
	DEFAULT_KEEPALIVE_CONFIG,
	loadKeepaliveConfig,
	parseKeepaliveMode,
} from "../src/config.js";

test("loads generic defaults and environment overrides", () => {
	assert.deepEqual(loadKeepaliveConfig({}), DEFAULT_KEEPALIVE_CONFIG);
	assert.deepEqual(
		loadKeepaliveConfig({
			PI_KEEPALIVE_INTERVAL_MS: "12000",
			PI_KEEPALIVE_MESSAGE: "resume work",
			PI_KEEPALIVE_MODE: "always",
			PI_KEEPALIVE_MAX_ATTEMPTS: "3",
		}),
		{
			intervalMs: 12000,
			message: "resume work",
			mode: "always",
			maxAttempts: 3,
		},
	);
});

test("recognizes assistant provider errors without naming a provider", () => {
	assert.equal(hasAssistantError([{ role: "assistant", stopReason: "error" }]), true);
	assert.equal(hasAssistantError([{ role: "assistant", stopReason: "error" }, { role: "assistant", stopReason: "stop" }]), false);
	assert.equal(hasAssistantError([{ role: "assistant", stopReason: "stop" }]), false);
	assert.equal(hasAssistantError([{ role: "user", stopReason: "error" }]), false);
});

test("sends a manual retry only when the agent is idle", () => {
	let idle = false;
	const sent: string[] = [];
	const controller = new KeepaliveController({ ...DEFAULT_KEEPALIVE_CONFIG });
	controller.setRuntime({
		isIdle: () => idle,
		sendUserMessage: (message) => sent.push(message),
	});

	assert.equal(controller.sendNow(), false);
	idle = true;
	assert.equal(controller.sendNow(), true);
	assert.deepEqual(sent, ["continue"]);
});

test("arms after an error and clears after a successful run", () => {
	const controller = new KeepaliveController({ ...DEFAULT_KEEPALIVE_CONFIG });
	controller.setRuntime({ isIdle: () => true, sendUserMessage: () => undefined });

	controller.onAgentEnd([{ role: "assistant", stopReason: "error" }]);
	assert.equal(controller.status().waitingForError, true);
	controller.onAgentEnd([{ role: "assistant", stopReason: "stop" }]);
	assert.equal(controller.status().waitingForError, false);
});

test("parses mode aliases consistently for env and command", () => {
	assert.equal(parseKeepaliveMode("always"), "always");
	assert.equal(parseKeepaliveMode("retry"), "on-error");
	assert.equal(parseKeepaliveMode("off"), "off");
	assert.equal(parseKeepaliveMode("bogus"), undefined);
	assert.equal(parseKeepaliveMode(undefined), undefined);
});

test("stops after the configured attempt cap", async () => {
	const sent: string[] = [];
	const controller = new KeepaliveController({
		...DEFAULT_KEEPALIVE_CONFIG,
		intervalMs: 5,
		maxAttempts: 2,
	});
	let idle = true;
	controller.setRuntime({ isIdle: () => idle, sendUserMessage: (message) => sent.push(message) });

	for (let round = 0; round < 3; round += 1) {
		controller.onAgentEnd([{ role: "assistant", stopReason: "error" }]);
		controller.onAgentSettled();
		idle = true;
		// Yield so the pending timer can observe the idle agent and send.
		await new Promise((resolve) => setTimeout(resolve, 15));
		// Simulate each automatic retry failing again.
		idle = false;
	}

	assert.equal(sent.length, 2);
	assert.equal(controller.status().timerActive, false);
	controller.dispose();
});

test("sends one delayed message after a settled error", async () => {
	const sent: string[] = [];
	const controller = new KeepaliveController({
		...DEFAULT_KEEPALIVE_CONFIG,
		intervalMs: 10,
	});
	controller.setRuntime({ isIdle: () => true, sendUserMessage: (message) => sent.push(message) });

	controller.onAgentEnd([{ role: "assistant", stopReason: "error" }]);
	controller.onAgentSettled();
	await new Promise((resolve) => setTimeout(resolve, 25));

	assert.deepEqual(sent, ["continue"]);
	assert.equal(controller.status().timerActive, false);
	controller.dispose();
});
