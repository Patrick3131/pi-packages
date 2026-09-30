import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDelegationGuidance,
  DELEGATION_GUIDANCE,
  DELEGATION_HEADING,
} from "../src/guidance.js";

test("appends the policy when the session can delegate", () => {
  const prompt = appendDelegationGuidance({
    selectedTools: ["read", "bash", "subagent"],
    systemPrompt: "You are Pi.\n",
  });

  assert.ok(prompt);
  assert.ok(prompt.startsWith("You are Pi."));
  assert.ok(prompt.endsWith(DELEGATION_GUIDANCE));
  assert.equal(prompt.slice(0, "You are Pi.".length), "You are Pi.");
});

test("separates the policy from the prompt with exactly one blank line", () => {
  const prompt = appendDelegationGuidance({
    selectedTools: ["subagent"],
    systemPrompt: "You are Pi.\n\n\n",
  });

  assert.ok(prompt);
  assert.ok(prompt.startsWith("You are Pi.\n\n## Delegation policy"));
});

test("stays inert without the subagent tool", () => {
  for (const selectedTools of [undefined, [], ["read", "bash", "edit"]]) {
    assert.equal(
      appendDelegationGuidance({ selectedTools, systemPrompt: "You are Pi." }),
      undefined,
    );
  }
});

test("does not duplicate a policy already present in the prompt", () => {
  // An APPEND_SYSTEM.md copy of the same policy must not be doubled up.
  assert.equal(
    appendDelegationGuidance({
      selectedTools: ["subagent"],
      systemPrompt: `You are Pi.\n\n${DELEGATION_GUIDANCE}`,
    }),
    undefined,
  );
});

test("keeps the parent-owned limits in the policy text", () => {
  // Capability-gated injection must not grant authority or imply phase agents.
  assert.ok(DELEGATION_GUIDANCE.includes("Work directly by default"));
  assert.ok(DELEGATION_GUIDANCE.includes("instructions authorize delegation"));
  assert.ok(DELEGATION_GUIDANCE.includes("risk alone do not authorize it"));
  assert.ok(DELEGATION_GUIDANCE.includes("Keep with the parent"));
  assert.ok(DELEGATION_GUIDANCE.includes("fresh-context"));
  assert.ok(DELEGATION_GUIDANCE.includes("read-only"));
  assert.ok(DELEGATION_GUIDANCE.includes("publication authority"));
  assert.doesNotMatch(DELEGATION_GUIDANCE, /work-item-(?:router|researcher|writer|reviewer)|test-validator|implement-tdd-review-\*/);
});
